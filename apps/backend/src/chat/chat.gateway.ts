import { UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { WsValidationPipe } from '../ws/ws-validation.pipe';
import { SendMessageDto } from './chat.dto';
import { ChatService } from './chat.service';

@UsePipes(WsValidationPipe)
@WebSocketGateway({ path: '/ws' })
export class ChatGateway {
  constructor(
    private readonly connectionService: WsConnectionService,
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
  ) {}

  @SubscribeMessage(WS_EVENT.CHAT_SEND)
  async handleChatSend(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: SendMessageDto,
  ) {
    const tracked = this.connectionService.getTracked(client);
    if (!tracked) return;

    const msg = await this.chatService.saveMessage(
      payload.roomId,
      tracked.identity.userId,
      tracked.identity.displayName,
      payload.content,
    );

    this.roomService.broadcastToRoom(String(msg.roomId), WS_EMIT.CHAT_MESSAGE, msg);
  }
}
