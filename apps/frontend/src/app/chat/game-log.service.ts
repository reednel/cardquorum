import { effect, inject, Injectable, signal } from '@angular/core';
import { GameLogBroadcast, GameLogHistoryPayload, WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { RoomContextService } from '../room/room-context.service';
import { WebSocketService } from '../websocket.service';
import { deduplicateEntries, prependHistory } from './game-log-utils';

@Injectable({ providedIn: 'root' })
export class GameLogService {
  private readonly _entries = signal<GameLogBroadcast[]>([]);
  private readonly _loading = signal(false);
  private readonly _exhausted = signal(false);
  private readonly _cursor = signal<number | null>(null);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly exhausted = this._exhausted.asReadonly();

  private readonly ws = inject(WebSocketService);
  private readonly roomContext = inject(RoomContextService);

  constructor() {
    this.ws.on<GameLogBroadcast>(WS_EMIT.GAME_LOG_ENTRY, (entry) => {
      if (entry.message != null && entry.timestamp != null) {
        this._entries.update((entries) => [...entries, entry]);
      }
    });

    this.ws.on<{ entries: GameLogBroadcast[] }>(WS_EMIT.GAME_LOG_CATCHUP, (data) => {
      const catchup = data.entries ?? [];
      const valid = catchup.filter((e) => e.message != null && e.timestamp != null);
      this._entries.update((existing) => deduplicateEntries(existing, valid));
    });

    this.ws.on<{ entries: GameLogBroadcast[] }>(WS_EMIT.GAME_LOG_HISTORY, (data) => {
      const history = data.entries ?? [];
      this._loading.set(false);

      if (history.length === 0) {
        this._exhausted.set(true);
        return;
      }

      const valid = history.filter((e) => e.message != null && e.timestamp != null);
      this._entries.update((existing) => {
        const merged = prependHistory(existing, valid);
        return merged;
      });

      // Use the last entry's id as cursor for next page (results are desc order)
      const lastEntry = history[history.length - 1];
      if (lastEntry?.id != null) {
        this._cursor.set(lastEntry.id);
      }
    });

    this.ws.onConnect(() => {
      const roomId = this.roomContext.currentRoomId();
      if (roomId !== null) {
        // Reset pagination state but keep existing entries until fresh data arrives.
        // Catchup from GAME_REJOIN will deduplicate, and we request the first
        // page of history so the log repopulates without a visible gap.
        this._loading.set(false);
        this._exhausted.set(false);
        this._cursor.set(null);
        this._initialHistoryLoaded = false;
        this.requestHistory();
      }
    });

    // When the user joins a room (currentRoomId transitions to non-null),
    // request the first page of history. This covers the fresh page load case
    // where onConnect fires before the room ID is set.
    effect(() => {
      const roomId = this.roomContext.currentRoomId();
      if (roomId !== null && !this._initialHistoryLoaded) {
        this._initialHistoryLoaded = true;
        this.requestHistory();
      }
    });
  }

  private _initialHistoryLoaded = false;

  requestHistory(): void {
    const roomId = this.roomContext.currentRoomId();
    if (!roomId) return;

    this._loading.set(true);

    const payload: GameLogHistoryPayload = {
      roomId,
      pageSize: 50,
    };

    const cursor = this._cursor();
    if (cursor !== null) {
      payload.cursor = cursor;
    }

    this.ws.send(WS_EVENT.GAME_LOG_HISTORY, payload);
  }

  clearEntries(): void {
    this._entries.set([]);
    this._loading.set(false);
    this._exhausted.set(false);
    this._cursor.set(null);
    this._initialHistoryLoaded = false;
  }
}
