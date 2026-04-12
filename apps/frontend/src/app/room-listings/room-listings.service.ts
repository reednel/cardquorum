import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PaginatedResponse, RoomResponse } from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class RoomListingsService {
  private readonly http = inject(HttpClient);

  loadMemberships(): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>('/api/rooms/memberships');
  }

  loadDiscoverPrivate(): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>('/api/rooms/discover', {
      params: { filter: 'private' },
    });
  }

  loadDiscoverPublic(page: number, pageSize: number): Observable<PaginatedResponse<RoomResponse>> {
    return this.http.get<PaginatedResponse<RoomResponse>>('/api/rooms/discover', {
      params: { filter: 'public', page, pageSize },
    });
  }

  searchDiscover(query: string): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>('/api/rooms/discover', {
      params: { search: query },
    });
  }

  leaveRoom(roomId: number): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}/roster`);
  }
}
