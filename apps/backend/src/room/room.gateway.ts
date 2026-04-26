import { forwardRef, Inject, Logger, OnModuleInit, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { GameService } from '../game/game.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { WsValidationPipe } from '../ws/ws-validation.pipe';
import {
  GameSettingsLoadDto,
  GameSettingsUpdateDto,
  JoinRoomDto,
  LeaveRoomDto,
  LeaveRosterDto,
  RosterReorderDto,
  RosterSetRotationModeDto,
  RosterToggleReadyDto,
  RosterToggleRotateDto,
} from './room.dto';
import { RoomService } from './room.service';

@UsePipes(WsValidationPipe)
@WebSocketGateway({ path: '/ws' })
export class RoomGateway implements OnModuleInit {
  private readonly logger = new Logger(RoomGateway.name);

  constructor(
    private readonly connectionService: WsConnectionService,
    private readonly roomService: RoomService,
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
  ) {}

  onModuleInit() {
    this.connectionService.onDisconnect((tracked) => {
      const departures = this.roomService.manager.leaveAllRooms(tracked.id);
      for (const { roomId, identity } of departures) {
        this.roomService.broadcastToRoom(roomId, WS_EMIT.MEMBER_LEFT, { roomId, member: identity });
      }
    });
  }

  @SubscribeMessage(WS_EVENT.ROOM_JOIN)
  async handleJoinRoom(@ConnectedSocket() client: WebSocket, @MessageBody() payload: JoinRoomDto) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const exists = await this.roomService.roomExists(roomId);
    if (!exists) {
      this.send(client, WS_EMIT.ERROR, { message: 'Room does not exist' });
      return;
    }

    const canAccess = await this.roomService.canAccessRoom(roomId, tracked.identity.userId);
    if (!canAccess) {
      this.send(client, WS_EMIT.ERROR, { message: 'You do not have access to this room' });
      return;
    }

    const roomKey = String(roomId);
    this.roomService.manager.joinRoom(roomKey, tracked.id, tracked.identity);

    // Check if user is already on the roster; if not, add them
    const userId = tracked.identity.userId;
    const isOnRoster = await this.roomService.isMember(roomId, userId);
    let roster;
    if (!isOnRoster) {
      try {
        roster = await this.roomService.addToRoster(roomId, userId);
      } catch (err) {
        // Room is full — undo the WS join and notify client
        this.roomService.manager.leaveRoom(roomKey, tracked.id);
        this.send(client, WS_EMIT.ERROR, {
          message: err instanceof Error ? err.message : 'Room is full',
        });
        return;
      }
    } else {
      roster = await this.roomService.getRoster(roomId);
    }

    // Update last_visited_at for the memberships page ordering
    try {
      await this.roomService.updateLastVisitedAt(roomId, userId);
    } catch (err) {
      this.logger.warn(
        `Failed to update last_visited_at for user ${userId} in room ${roomId}: ${err}`,
      );
    }

    const members = this.roomService.manager.getRoomMembers(roomKey);
    const history = await this.roomService.getMessageHistory(roomId);

    this.send(client, WS_EMIT.ROOM_JOINED, { roomId, members, roster });
    this.send(client, WS_EMIT.MESSAGE_HISTORY, { roomId, messages: history });

    this.roomService.broadcastToRoom(
      roomKey,
      WS_EMIT.MEMBER_JOINED,
      { roomId, member: tracked.identity },
      tracked.id,
    );
  }

  @SubscribeMessage(WS_EVENT.ROOM_LEAVE)
  handleLeaveRoom(@ConnectedSocket() client: WebSocket, @MessageBody() payload: LeaveRoomDto) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomKey = String(payload.roomId);
    const identity = this.roomService.manager.leaveRoom(roomKey, tracked.id);
    if (identity) {
      this.roomService.broadcastToRoom(roomKey, WS_EMIT.MEMBER_LEFT, {
        roomId: payload.roomId,
        member: identity,
      });
    }
  }

  @SubscribeMessage(WS_EVENT.ROOM_LEAVE_ROSTER)
  async handleLeaveRoster(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: LeaveRosterDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const userId = tracked.identity.userId;

    try {
      await this.roomService.removeFromRoster(roomId, userId);
    } catch (err) {
      this.send(client, WS_EMIT.ERROR, {
        message: err instanceof Error ? err.message : 'Failed to leave roster',
      });
      return;
    }

    // Disconnect WS from the room
    const roomKey = String(roomId);
    this.roomService.manager.leaveRoom(roomKey, tracked.id);

    // Broadcast MEMBER_LEFT to remaining members
    this.roomService.broadcastToRoom(roomKey, WS_EMIT.MEMBER_LEFT, {
      roomId,
      member: tracked.identity,
    });
  }

  @SubscribeMessage(WS_EVENT.ROSTER_UPDATE)
  async handleRosterUpdate(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: RosterReorderDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const userId = tracked.identity.userId;

    // Verify the requesting user is the room owner
    const room = await this.roomService.findById(roomId);
    if (!room || room.ownerId !== userId) {
      this.send(client, WS_EMIT.ERROR, {
        message: 'Only the room owner can reorder the roster',
      });
      return;
    }

    const gameActive = this.gameService.isGameActive(roomId);

    try {
      await this.roomService.reorderRoster(roomId, payload.players, payload.spectators, {
        gameActive,
      });
    } catch (err) {
      this.send(client, WS_EMIT.ERROR, {
        message: err instanceof Error ? err.message : 'Failed to reorder roster',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.ROSTER_TOGGLE_ROTATE)
  async handleRosterToggleRotate(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: RosterToggleRotateDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const userId = tracked.identity.userId;

    // Verify the requesting user is the room owner
    const room = await this.roomService.findById(roomId);
    if (!room || room.ownerId !== userId) {
      this.send(client, WS_EMIT.ERROR, {
        message: 'Only the room owner can toggle rotation',
      });
      return;
    }

    try {
      // Legacy handler — map boolean to rotation mode
      const mode = payload.enabled ? 'rotate-players' : 'none';
      await this.roomService.setRotationMode(roomId, mode);
    } catch (err) {
      this.send(client, WS_EMIT.ERROR, {
        message: err instanceof Error ? err.message : 'Failed to toggle rotation',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.ROSTER_TOGGLE_READY)
  async handleToggleReady(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: RosterToggleReadyDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    try {
      await this.roomService.toggleReady(payload.roomId, tracked.identity.userId);
    } catch (err) {
      this.send(client, WS_EMIT.ERROR, {
        message: err instanceof Error ? err.message : 'Failed to toggle ready status',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.ROSTER_SET_ROTATION_MODE)
  async handleSetRotationMode(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: RosterSetRotationModeDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const userId = tracked.identity.userId;

    // Verify the requesting user is the room owner
    const room = await this.roomService.findById(roomId);
    if (!room || room.ownerId !== userId) {
      this.send(client, WS_EMIT.ERROR, {
        message: 'Only the room owner can change rotation mode',
      });
      return;
    }

    try {
      await this.roomService.setRotationMode(roomId, payload.mode as any);
    } catch (err) {
      this.send(client, WS_EMIT.ERROR, {
        message: err instanceof Error ? err.message : 'Failed to set rotation mode',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_SETTINGS_UPDATE)
  async handleGameSettingsUpdate(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameSettingsUpdateDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const roomId = payload.roomId;
    const userId = tracked.identity.userId;

    // Verify the requesting user is the room owner
    const room = await this.roomService.findById(roomId);
    if (!room || room.ownerId !== userId) {
      this.send(client, WS_EMIT.GAME_ERROR, {
        message: 'Only the room owner can update game settings',
      });
      return;
    }

    try {
      await this.roomService.upsertGameSettings(roomId, payload.settings);
    } catch (err) {
      this.logger.error(`Failed to upsert game settings for room ${roomId}: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, {
        message: 'Failed to save game settings',
      });
      return;
    }

    // Broadcast updated settings to all room members
    this.roomService.broadcastToRoom(String(roomId), WS_EMIT.GAME_SETTINGS_UPDATED, {
      settings: payload.settings,
    });
  }

  @SubscribeMessage(WS_EVENT.GAME_SETTINGS_LOAD)
  async handleGameSettingsLoad(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameSettingsLoadDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const row = await this.roomService.loadGameSettings(payload.roomId);

    const settings = row
      ? {
          gameType: row.gameType,
          presetName: row.presetName,
          config: row.config as Record<string, unknown>,
          autostart: row.autostart,
        }
      : null;

    this.send(client, WS_EMIT.GAME_SETTINGS_LOADED, { settings });
  }

  private send(client: WebSocket, event: string, data: unknown) {
    try {
      client.send(JSON.stringify({ event, data }));
    } catch (err) {
      this.logger.warn(`Failed to send to client: ${err}`);
    }
  }
}
