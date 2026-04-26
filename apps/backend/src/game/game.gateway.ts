import { Logger, OnModuleInit, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { ColorAssignmentMap, WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { WsValidationPipe } from '../ws/ws-validation.pipe';
import {
  GameAbandonDto,
  GameActionDto,
  GameCancelDto,
  GameCreateDto,
  GameQueryTargetsDto,
  GameRejoinDto,
  GameStartDto,
} from './game.dto';
import { GameService } from './game.service';

@UsePipes(WsValidationPipe)
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnModuleInit {
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly connectionService: WsConnectionService,
    private readonly roomService: RoomService,
    private readonly gameService: GameService,
  ) {}

  onModuleInit() {
    this.connectionService.onDisconnect(async (tracked) => {
      const userId = tracked.identity.userId;

      // The disconnecting client is still tracked at this point (untrack
      // happens after all listeners run), so count > 1 means other tabs remain.
      const remaining = this.connectionService.getClientsByUserId(userId);
      if (remaining.length > 1) return;

      const cancelled = await this.gameService.cleanupDisconnectedCreator(userId);
      for (const { sessionId, roomId } of cancelled) {
        this.roomService.broadcastToRoom(String(roomId), WS_EMIT.GAME_CANCELLED, { sessionId });
      }
    });
  }

  @SubscribeMessage(WS_EVENT.GAME_CREATE)
  async handleGameCreate(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameCreateDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    // Verify sender is the room owner
    const roomKey = String(payload.roomId);
    const room = await this.roomService.findById(payload.roomId);
    if (!room || room.ownerId !== tracked.identity.userId) {
      this.send(client, WS_EMIT.GAME_ERROR, {
        message: 'Only the room owner can create a game',
      });
      return;
    }

    try {
      const result = await this.gameService.createSession(
        payload.roomId,
        payload.gameType,
        payload.config,
        tracked.identity.userId,
      );

      this.roomService.broadcastToRoom(roomKey, WS_EMIT.GAME_CREATED, {
        sessionId: result.sessionId,
        gameType: result.gameType,
        config: result.config,
      });
    } catch (err) {
      this.logger.warn(`game:create failed: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, { message: 'Failed to create game session' });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_START)
  async handleGameStart(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameStartDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    try {
      const result = await this.gameService.startSession(
        payload.sessionId,
        tracked.identity.userId,
      );

      this.sendPlayerViews(
        result.playerViews,
        payload.sessionId,
        WS_EMIT.GAME_STARTED,
        result.colorMap,
      );
    } catch (err) {
      this.logger.warn(`game:start failed for session ${payload.sessionId}: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, {
        sessionId: payload.sessionId,
        message: 'Failed to start game session',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_ACTION)
  async handleGameAction(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameActionDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const broadcastFn = (result: {
      gameOver: boolean;
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
      store?: unknown;
    }) => {
      if (result.gameOver) {
        // Send final state update first so clients have scored state
        this.sendPlayerViews(result.playerViews, payload.sessionId, WS_EMIT.GAME_STATE_UPDATE);
        // Then send game-over with store
        this.sendToPlayers(
          result.playerViews.map(([id]) => id),
          WS_EMIT.GAME_OVER,
          { sessionId: payload.sessionId, store: result.store },
        );
      } else {
        this.sendPlayerViews(result.playerViews, payload.sessionId, WS_EMIT.GAME_STATE_UPDATE);
      }
    };

    try {
      const result = await this.gameService.applyAction(
        payload.sessionId,
        tracked.identity.userId,
        payload.action,
        broadcastFn,
      );

      broadcastFn(result);
    } catch (err) {
      this.logger.warn(`game:action failed for session ${payload.sessionId}: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, {
        sessionId: payload.sessionId,
        message: 'Invalid action',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_CANCEL)
  async handleGameCancel(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameCancelDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    try {
      const { roomId } = await this.gameService.cancelSession(
        payload.sessionId,
        tracked.identity.userId,
      );

      this.roomService.broadcastToRoom(String(roomId), WS_EMIT.GAME_CANCELLED, {
        sessionId: payload.sessionId,
      });
    } catch (err) {
      this.logger.warn(`game:cancel failed for session ${payload.sessionId}: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, {
        sessionId: payload.sessionId,
        message: 'Failed to cancel game session',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_ABANDON)
  async handleGameAbandon(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameAbandonDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    try {
      const { roomId, playerViews, store } = await this.gameService.abandonGame(
        payload.sessionId,
        tracked.identity.userId,
      );

      // Send final state + game-over to players
      this.sendPlayerViews(playerViews, payload.sessionId, WS_EMIT.GAME_STATE_UPDATE);
      this.sendToPlayers(
        playerViews.map(([id]) => id),
        WS_EMIT.GAME_OVER,
        { sessionId: payload.sessionId, store },
      );
    } catch (err) {
      this.logger.warn(`game:abandon failed for session ${payload.sessionId}: ${err}`);
      this.send(client, WS_EMIT.GAME_ERROR, {
        sessionId: payload.sessionId,
        message: err instanceof Error ? err.message : 'Failed to abandon game',
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_REJOIN)
  async handleGameRejoin(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameRejoinDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const result = await this.gameService.getSessionInfoByRoom(
      payload.roomId,
      tracked.identity.userId,
    );

    if (!result) {
      // No in-memory game for this room — tell the client to clear stale state
      this.send(client, WS_EMIT.GAME_CANCELLED, { sessionId: 0 });
      return;
    }

    if (result.status === 'waiting') {
      this.send(client, WS_EMIT.GAME_CREATED, {
        sessionId: result.sessionId,
        gameType: result.gameType,
        config: result.config,
      });
    } else {
      this.send(client, WS_EMIT.GAME_STARTED, {
        sessionId: result.sessionId,
        state: result.state,
        validActions: result.validActions,
        colorMap: result.colorMap,
        gameType: result.gameType,
      });
    }
  }

  @SubscribeMessage(WS_EVENT.GAME_QUERY_TARGETS)
  async handleQueryTargets(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: GameQueryTargetsDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    try {
      const targets = this.gameService.getValidTargets(
        payload.sessionId,
        tracked.identity.userId,
        payload.sourceStackId,
        payload.selectedCards,
      );
      this.send(client, WS_EMIT.GAME_VALID_TARGETS, {
        generation: payload.generation,
        targets,
      });
    } catch (err) {
      this.logger.warn(`game:query-targets failed: ${err}`);
      this.send(client, WS_EMIT.GAME_VALID_TARGETS, {
        generation: payload.generation,
        targets: [],
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

  /** Send per-player views: each player gets their own state. */
  private sendPlayerViews(
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    sessionId: number,
    event: string,
    colorMap?: ColorAssignmentMap,
  ) {
    for (const [userID, { state, validActions }] of playerViews) {
      const data: Record<string, unknown> = { sessionId, state, validActions };
      if (colorMap) {
        data.colorMap = colorMap;
      }
      const message = JSON.stringify({ event, data });
      for (const client of this.connectionService.getClientsByUserId(userID)) {
        try {
          client.ws.send(message);
        } catch (err) {
          this.logger.warn(`Failed to send to ${client.id}: ${err}`);
        }
      }
    }
  }

  /** Send the same payload to all players in the list. */
  private sendToPlayers(playerIDs: number[], event: string, data: unknown) {
    const message = JSON.stringify({ event, data });
    for (const userID of playerIDs) {
      for (const client of this.connectionService.getClientsByUserId(userID)) {
        try {
          client.ws.send(message);
        } catch (err) {
          this.logger.warn(`Failed to send to ${client.id}: ${err}`);
        }
      }
    }
  }
}
