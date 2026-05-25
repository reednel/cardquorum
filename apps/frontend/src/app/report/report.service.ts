import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportFilters } from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  getReport(gameType: string, filters: ReportFilters): Observable<unknown> {
    let params = new HttpParams();

    if (filters.variants?.length) {
      params = params.set('variants', filters.variants.join(','));
    }

    if (filters.startDate) {
      params = params.set('startDate', filters.startDate);
    }

    if (filters.endDate) {
      params = params.set('endDate', filters.endDate);
    }

    return this.http.get<unknown>(`/api/reports/${gameType}`, { params });
  }
}
