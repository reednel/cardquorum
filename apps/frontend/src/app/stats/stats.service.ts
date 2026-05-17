import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PlayerStatsResponse, RoomStatsResponse, StatsQueryParams } from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  getRoomStats(roomId: number, params: StatsQueryParams): Observable<RoomStatsResponse> {
    const httpParams = this.buildParams(params);
    return this.http.get<RoomStatsResponse>(`/api/stats/room/${roomId}`, { params: httpParams });
  }

  getPlayerStats(params: StatsQueryParams): Observable<PlayerStatsResponse> {
    const httpParams = this.buildParams(params);
    return this.http.get<PlayerStatsResponse>('/api/stats/player', { params: httpParams });
  }

  private buildParams(params: StatsQueryParams): HttpParams {
    let httpParams = new HttpParams();

    if (params.gameType) {
      httpParams = httpParams.set('gameType', params.gameType);
    }

    if (params.timeRange && params.timeRange !== 'all') {
      httpParams = httpParams.set('timeRange', params.timeRange);
    }

    return httpParams;
  }
}
