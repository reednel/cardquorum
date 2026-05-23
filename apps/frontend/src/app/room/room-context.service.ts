import { inject, Injectable, signal } from '@angular/core';
import {
  MemberChangePayload,
  MemberKickedPayload,
  RoomDeletedPayload,
  RoomJoinedPayload,
  UserIdentity,
  WS_EMIT,
  WS_EVENT,
  WsErrorPayload,
} from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class RoomContextService {
  private readonly _members = signal<UserIdentity[]>([]);
  private readonly _currentRoomId = signal<number | null>(null);
  private readonly _roomDeleted = signal<number | null>(null);
  private readonly _joinError = signal<string | null>(null);

  /**
   * Accumulated member identities for the current room session.
   * Members who leave mid-game are retained so their display names
   * can still be resolved on the game table and summary.
   */
  private readonly _memberCache = new Map<number, UserIdentity>();
  private readonly _allKnownMembers = signal<UserIdentity[]>([]);

  readonly members = this._members.asReadonly();
  /** All members ever seen in this room session (survives leaves/reconnects). */
  readonly allKnownMembers = this._allKnownMembers.asReadonly();
  readonly currentRoomId = this._currentRoomId.asReadonly();
  readonly roomDeleted = this._roomDeleted.asReadonly();
  readonly joinError = this._joinError.asReadonly();

  private readonly ws = inject(WebSocketService);

  private updateCache(members: UserIdentity[]): void {
    for (const m of members) {
      this._memberCache.set(m.userId, m);
    }
    this._allKnownMembers.set([...this._memberCache.values()]);
  }

  constructor() {
    this.ws.on<RoomJoinedPayload>(WS_EMIT.ROOM_JOINED, (data) => {
      this._joinError.set(null);
      this._members.set(data.members);
      this.updateCache(data.members);
    });
    this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_JOINED, (data) => {
      this._members.update((m) => [...m, data.member]);
      this.updateCache([data.member]);
    });
    this.ws.on<MemberChangePayload>(WS_EMIT.MEMBER_LEFT, (data) => {
      this._members.update((m) => m.filter((u) => u.userId !== data.member.userId));
    });
    this.ws.on<RoomDeletedPayload>(WS_EMIT.ROOM_DELETED, (data) => {
      this._roomDeleted.set(data.roomId);
    });
    this.ws.on<MemberKickedPayload>(WS_EMIT.MEMBER_KICKED, (data) => {
      if (data.roomId === this._currentRoomId()) {
        this._roomDeleted.set(data.roomId);
      }
    });
    this.ws.on<WsErrorPayload>(WS_EMIT.ERROR, (data) => {
      if (this._currentRoomId() !== null && this._members().length === 0) {
        this._joinError.set(data.message);
      }
    });

    this.ws.onConnect(() => {
      const roomId = this._currentRoomId();
      if (roomId !== null) {
        this.ws.send(WS_EVENT.ROOM_JOIN, { roomId });
      }
    });
  }

  joinRoom(roomId: number): void {
    this._roomDeleted.set(null);
    this._joinError.set(null);
    this._currentRoomId.set(roomId);
    this._members.set([]);
    this._memberCache.clear();
    this._allKnownMembers.set([]);
    this.ws.send(WS_EVENT.ROOM_JOIN, { roomId });
  }

  leaveRoom(): void {
    const roomId = this._currentRoomId();
    if (roomId) {
      this.ws.send(WS_EVENT.ROOM_LEAVE, { roomId });
      this._currentRoomId.set(null);
      this._members.set([]);
      this._memberCache.clear();
      this._allKnownMembers.set([]);
    }
  }
}
