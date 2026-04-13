import { inject, Injectable, signal } from '@angular/core';
import { ChatMessagePayload, MessageHistoryPayload, WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { RoomContextService } from '../room/room-context.service';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly _messages = signal<ChatMessagePayload[]>([]);

  readonly messages = this._messages.asReadonly();

  private readonly ws = inject(WebSocketService);
  private readonly roomContext = inject(RoomContextService);

  constructor() {
    this.ws.on<MessageHistoryPayload>(WS_EMIT.MESSAGE_HISTORY, (data) => {
      this._messages.set(data.messages);
    });
    this.ws.on<ChatMessagePayload>(WS_EMIT.CHAT_MESSAGE, (data) => {
      this._messages.update((msgs) => [...msgs, data]);
    });
  }

  clearMessages(): void {
    this._messages.set([]);
  }

  sendMessage(content: string): void {
    const roomId = this.roomContext.currentRoomId();
    if (roomId && content.trim()) {
      this.ws.send(WS_EVENT.CHAT_SEND, { roomId, content: content.trim() });
    }
  }
}
