import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  RoomInviteResponse,
  RoomJoinedPayload,
  RosterMember,
  RosterState,
  RosterUpdatePayload,
  WS_EMIT,
} from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

// --- Pure helper functions (exported for independent testing) ---

export function computeStatus(userId: number, onlineUserIds: Set<number>): 'online' | 'offline' {
  return onlineUserIds.has(userId) ? 'online' : 'offline';
}

export function computeInvitedList(
  invites: RoomInviteResponse[],
  roster: RosterState,
): RoomInviteResponse[] {
  const rosterUserIds = new Set([
    ...roster.players.map((m) => m.userId),
    ...roster.spectators.map((m) => m.userId),
  ]);
  return invites.filter((inv) => !rosterUserIds.has(inv.userId));
}

export function formatRosterCount(count: number, limit: number | null): string {
  if (limit != null && limit > 0) {
    return `${count} / ${limit}`;
  }
  return `${count}`;
}

// --- RosterService ---

@Injectable({ providedIn: 'root' })
export class RosterService {
  readonly players = signal<RosterMember[]>([]);
  readonly spectators = signal<RosterMember[]>([]);
  readonly rotatePlayers = signal<boolean>(false);

  private readonly ws = inject(WebSocketService);
  private readonly http = inject(HttpClient);

  constructor() {
    this.ws.on<RosterUpdatePayload>(WS_EMIT.ROSTER_UPDATED, (data) => {
      this.applyRoster(data.roster);
    });

    this.ws.on<RoomJoinedPayload>(WS_EMIT.ROOM_JOINED, (data) => {
      this.applyRoster(data.roster);
    });
  }

  // --- HTTP methods ---

  reorderRoster(roomId: number, players: number[], spectators: number[]): Observable<RosterState> {
    return this.http.put<RosterState>(`/api/rooms/${roomId}/roster`, {
      players,
      spectators,
    });
  }

  kickUser(roomId: number, userId: number): Observable<unknown> {
    return this.http.post(`/api/rooms/${roomId}/kick`, { userId });
  }

  toggleRotate(roomId: number, enabled: boolean): Observable<RosterState> {
    return this.http.patch<RosterState>(`/api/rooms/${roomId}/roster/rotate`, { enabled });
  }

  // --- Internal helpers ---

  private applyRoster(roster: RosterState): void {
    this.players.set(roster.players);
    this.spectators.set(roster.spectators);
    this.rotatePlayers.set(roster.rotatePlayers);
  }
}
