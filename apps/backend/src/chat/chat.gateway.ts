import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'ws';
import {
  WS_EVENT,
  WS_EMIT,
  JoinRoomPayload,
  LeaveRoomPayload,
  SendMessagePayload,
  UserIdentity,
} from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { ChatService } from './chat.service';

/** Map ws clients by a stable connection ID. */
interface TrackedClient {
  id: string;
  ws: any;
  identity?: UserIdentity;
}

@WebSocketGateway({ path: '/ws' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  private clients = new Map<any, TrackedClient>();
  private nextId = 1;

  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
  ) {}

  handleConnection(client: any) {
    const id = `conn-${this.nextId++}`;
    this.clients.set(client, { id, ws: client });
    this.logger.log(`Client connected: ${id}`);
  }

  handleDisconnect(client: any) {
    const tracked = this.clients.get(client);
    if (!tracked) return;

    this.logger.log(`Client disconnected: ${tracked.id}`);
    const departures = this.roomService.manager.leaveAllRooms(tracked.id);
    for (const { roomId, identity } of departures) {
      this.broadcastToRoom(roomId, WS_EMIT.MEMBER_LEFT, { roomId, member: identity });
    }
    this.clients.delete(client);
  }

  @SubscribeMessage(WS_EVENT.ROOM_JOIN)
  async handleJoinRoom(@ConnectedSocket() client: any, @MessageBody() payload: JoinRoomPayload) {
    const tracked = this.clients.get(client);
    if (!tracked) return;

    const identity: UserIdentity = {
      userId: tracked.id, // stub: use connection ID as user ID until auth
      nickname: payload.nickname,
    };
    tracked.identity = identity;

    await this.roomService.ensureRoomExists(payload.roomId);
    this.roomService.manager.joinRoom(payload.roomId, tracked.id, identity);

    const members = this.roomService.manager.getRoomMembers(payload.roomId);
    const history = await this.chatService.getRecentMessages(payload.roomId);

    this.send(client, WS_EMIT.ROOM_JOINED, { roomId: payload.roomId, members });
    this.send(client, WS_EMIT.MESSAGE_HISTORY, { roomId: payload.roomId, messages: history });

    this.broadcastToRoom(
      payload.roomId,
      WS_EMIT.MEMBER_JOINED,
      {
        roomId: payload.roomId,
        member: identity,
      },
      tracked.id,
    );
  }

  @SubscribeMessage(WS_EVENT.ROOM_LEAVE)
  handleLeaveRoom(@ConnectedSocket() client: any, @MessageBody() payload: LeaveRoomPayload) {
    const tracked = this.clients.get(client);
    if (!tracked) return;

    const identity = this.roomService.manager.leaveRoom(payload.roomId, tracked.id);
    if (identity) {
      this.broadcastToRoom(payload.roomId, WS_EMIT.MEMBER_LEFT, {
        roomId: payload.roomId,
        member: identity,
      });
    }
  }

  @SubscribeMessage(WS_EVENT.CHAT_SEND)
  async handleChatSend(@ConnectedSocket() client: any, @MessageBody() payload: SendMessagePayload) {
    const tracked = this.clients.get(client);
    if (!tracked?.identity) {
      this.send(client, WS_EMIT.ERROR, { message: 'Join a room before sending messages' });
      return;
    }

    const msg = await this.chatService.saveMessage(
      payload.roomId,
      tracked.identity.userId,
      tracked.identity.nickname,
      payload.content,
    );

    this.broadcastToRoom(msg.roomId, WS_EMIT.CHAT_MESSAGE, msg);
  }

  private send(client: any, event: string, data: unknown) {
    client.send(JSON.stringify({ event, data }));
  }

  private broadcastToRoom(roomId: string, event: string, data: unknown, excludeConnId?: string) {
    const members = this.roomService.manager.getRoom(roomId);
    if (!members) return;

    const message = JSON.stringify({ event, data });
    for (const [ws, tracked] of this.clients) {
      if (tracked.id === excludeConnId) continue;
      if (members.members.has(tracked.id)) {
        ws.send(message);
      }
    }
  }
}
