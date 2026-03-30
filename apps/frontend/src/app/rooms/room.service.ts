import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateRoomRequest,
  RoomBanResponse,
  RoomInviteResponse,
  RoomResponse,
  UpdateRoomRequest,
} from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly _rooms = signal<RoomResponse[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly rooms = this._rooms.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly http = inject(HttpClient);

  loadRooms(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<RoomResponse[]>('/api/rooms').subscribe({
      next: (rooms) => {
        this._rooms.set(rooms);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
        this._error.set('Failed to load rooms');
      },
    });
  }

  createRoom(req: CreateRoomRequest): Observable<RoomResponse> {
    return this.http.post<RoomResponse>('/api/rooms', req);
  }

  updateRoom(id: number, req: UpdateRoomRequest): Observable<RoomResponse> {
    return this.http.patch<RoomResponse>(`/api/rooms/${id}`, req);
  }

  getRoom(id: number): Observable<RoomResponse> {
    return this.http.get<RoomResponse>(`/api/rooms/${id}`);
  }

  deleteRoom(id: number): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${id}`);
  }

  removeRoomFromList(roomId: number): void {
    this._rooms.update((rooms) => rooms.filter((r) => r.id !== roomId));
  }

  // --- Invites ---

  getInvites(roomId: number): Observable<RoomInviteResponse[]> {
    return this.http.get<RoomInviteResponse[]>(`/api/rooms/${roomId}/invites`);
  }

  inviteUser(roomId: number, userId: number): Observable<unknown> {
    return this.http.post(`/api/rooms/${roomId}/invites`, { userId });
  }

  uninviteUser(roomId: number, userId: number): Observable<unknown> {
    return this.http.delete(`/api/rooms/${roomId}/invites/${userId}`);
  }

  // --- Bans ---

  getBans(roomId: number): Observable<RoomBanResponse[]> {
    return this.http.get<RoomBanResponse[]>(`/api/rooms/${roomId}/bans`);
  }

  banUser(roomId: number, userId: number): Observable<unknown> {
    return this.http.post(`/api/rooms/${roomId}/bans`, { userId });
  }

  unbanUser(roomId: number, userId: number): Observable<unknown> {
    return this.http.delete(`/api/rooms/${roomId}/bans/${userId}`);
  }
}
