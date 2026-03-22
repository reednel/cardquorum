import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  ChatMessagePayload,
  MemberChangePayload,
  MessageHistoryPayload,
  RoomDeletedPayload,
  RoomJoinedPayload,
  UserIdentity,
  WS_EMIT,
  WS_EVENT,
} from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly _messages = signal<ChatMessagePayload[]>([]);
  private readonly _members = signal<UserIdentity[]>([]);
  private readonly _currentRoomId = signal<number | null>(null);
  private readonly _roomDeleted = signal<number | null>(null);

  readonly messages = this._messages.asReadonly();
  readonly members = this._members.asReadonly();
  readonly currentRoomId = this._currentRoomId.asReadonly();
  readonly roomDeleted = this._roomDeleted.asReadonly();

  private readonly ws = inject(WebSocketService);

  constructor() {
    // Event subscriptions live for the app lifetime (singleton service).
    // No unsubscribe needed — handlers are idempotent and persist across reconnects.
    this.ws.on<RoomJoinedPayload>(WS_EMIT.ROOM_JOINED, (data) => {
      this._members.set(data.members);
    });
    this.ws.on<MessageHistoryPayload>(WS_EMIT.MESSAGE_HISTORY, (data) => {
      this._messages.set(data.messages);
    });
    this.ws.on<ChatMessagePayload>(WS_EMIT.CHAT_MESSAGE, (data) => {
      this._messages.update((msgs) => [...msgs, data]);
    });
    this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_JOINED, (data) => {
      this._members.update((m) => [...m, data.member]);
    });
    this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_LEFT, (data) => {
      this._members.update((m) => m.filter((u) => u.userId !== data.member.userId));
    });
    this.ws.on<RoomDeletedPayload>(WS_EMIT.ROOM_DELETED, (data) => {
      this._roomDeleted.set(data.roomId);
    });

    // Re-join active room on reconnect.
    // Only tracks ws.connected() — uses untracked() for _currentRoomId to avoid
    // firing on room changes (joinRoom() sends its own ROOM_JOIN).
    let wasConnected = false;
    effect(() => {
      const connected = this.ws.connected();
      if (connected && !wasConnected) {
        const roomId = untracked(() => this._currentRoomId());
        if (roomId !== null) {
          this.ws.send(WS_EVENT.ROOM_JOIN, { roomId });
        }
      }
      wasConnected = connected;
    });
  }

  joinRoom(roomId: number): void {
    this._roomDeleted.set(null);
    this._currentRoomId.set(roomId);
    this._messages.set([]);
    this._members.set([]);
    this.ws.send(WS_EVENT.ROOM_JOIN, { roomId });
  }

  leaveRoom(): void {
    const roomId = this._currentRoomId();
    if (roomId) {
      this.ws.send(WS_EVENT.ROOM_LEAVE, { roomId });
      this._currentRoomId.set(null);
      this._messages.set([]);
      this._members.set([]);
    }
  }

  sendMessage(content: string): void {
    const roomId = this._currentRoomId();
    if (roomId && content.trim()) {
      this.ws.send(WS_EVENT.CHAT_SEND, { roomId, content: content.trim() });
    }
  }
}
