import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Observable } from 'rxjs';
import type { ReplayDataResponse, ReplaySessionListResponse } from '@cardquorum/shared';

export interface SessionListParams {
  gameType?: string;
  includeIncomplete?: boolean;
  cursor?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class ReplayApiService {
  private readonly http = inject(HttpClient);

  getReplayData(sessionId: number): Observable<ReplayDataResponse> {
    return this.http.get<ReplayDataResponse>(`/api/replay/session/${sessionId}`);
  }

  getSessions(params: SessionListParams): Observable<ReplaySessionListResponse> {
    let httpParams = new HttpParams();

    if (params.gameType != null) {
      httpParams = httpParams.set('gameType', params.gameType);
    }
    if (params.includeIncomplete != null) {
      httpParams = httpParams.set('includeIncomplete', String(params.includeIncomplete));
    }
    if (params.cursor != null) {
      httpParams = httpParams.set('cursor', params.cursor);
    }
    if (params.limit != null) {
      httpParams = httpParams.set('limit', String(params.limit));
    }

    return this.http.get<ReplaySessionListResponse>('/api/replay/sessions', {
      params: httpParams,
    });
  }
}
