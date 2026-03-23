import { Logger, OnModuleInit, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { MessageRepository } from '@cardquorum/db';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { WsConnectionService } from '../ws/ws-connection.service';
import { WsValidationPipe } from '../ws/ws-validation.pipe';
import { JoinRoomDto, LeaveRoomDto } from './room.dto';
import { RoomService } from './room.service';

@UsePipes(WsValidationPipe)
@WebSocketGateway({ path: '/ws' })
export class RoomGateway implements OnModuleInit {
  private readonly logger = new Logger(RoomGateway.name);

  constructor(
    private readonly connectionService: WsConnectionService,
    private readonly roomService: RoomService,
    private readonly messages: MessageRepository,
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

    const members = this.roomService.manager.getRoomMembers(roomKey);
    const history = await this.messages.findByRoomId(roomId);

    this.send(client, WS_EMIT.ROOM_JOINED, { roomId, members });
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

  private send(client: WebSocket, event: string, data: unknown) {
    try {
      client.send(JSON.stringify({ event, data }));
    } catch (err) {
      this.logger.warn(`Failed to send to client: ${err}`);
    }
  }
}
