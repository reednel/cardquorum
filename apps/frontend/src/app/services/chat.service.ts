import { Injectable, inject, signal } from '@angular/core';
import {
  WS_EVENT,
  WS_EMIT,
  ChatMessagePayload,
  RoomJoinedPayload,
  MessageHistoryPayload,
  MemberChangePayload,
  UserIdentity,
} from '@cardquorum/shared';
import { WebSocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly messages = signal<ChatMessagePayload[]>([]);
  readonly members = signal<UserIdentity[]>([]);
  readonly currentRoomId = signal<string | null>(null);

  private unsubscribes: Array<() => void> = [];
  private readonly ws = inject(WebSocketService);

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws.connect(`${protocol}//${location.host}/ws`);
    this.subscribeToEvents();
  }

  disconnect(): void {
    this.cleanup();
    this.ws.disconnect();
  }

  joinRoom(roomId: string, nickname: string): void {
    this.currentRoomId.set(roomId);
    this.messages.set([]);
    this.members.set([]);
    this.ws.send(WS_EVENT.ROOM_JOIN, { roomId, nickname });
  }

  leaveRoom(): void {
    const roomId = this.currentRoomId();
    if (roomId) {
      this.ws.send(WS_EVENT.ROOM_LEAVE, { roomId });
      this.currentRoomId.set(null);
      this.messages.set([]);
      this.members.set([]);
    }
  }

  sendMessage(content: string): void {
    const roomId = this.currentRoomId();
    if (roomId && content.trim()) {
      this.ws.send(WS_EVENT.CHAT_SEND, { roomId, content: content.trim() });
    }
  }

  private subscribeToEvents(): void {
    this.unsubscribes.push(
      this.ws.on<RoomJoinedPayload>(WS_EMIT.ROOM_JOINED, (data) => {
        this.members.set(data.members);
      }),
      this.ws.on<MessageHistoryPayload>(WS_EMIT.MESSAGE_HISTORY, (data) => {
        this.messages.set(data.messages);
      }),
      this.ws.on<ChatMessagePayload>(WS_EMIT.CHAT_MESSAGE, (data) => {
        this.messages.update((msgs) => [...msgs, data]);
      }),
      this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_JOINED, (data) => {
        this.members.update((m) => [...m, data.member]);
      }),
      this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_LEFT, (data) => {
        this.members.update((m) => m.filter((u) => u.userId !== data.member.userId));
      }),
    );
  }

  private cleanup(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
  }
}
