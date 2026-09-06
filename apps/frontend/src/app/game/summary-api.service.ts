import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Observable } from 'rxjs';
import type { SummaryDataResponse } from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class SummaryApiService {
  private readonly http = inject(HttpClient);

  getSummaryData(sessionId: number): Observable<SummaryDataResponse> {
    return this.http.get<SummaryDataResponse>(`/api/summary/session/${sessionId}`);
  }
}
