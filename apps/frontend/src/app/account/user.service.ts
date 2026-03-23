import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { UpdateDisplayNameRequest, UserProfile } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _profile = signal<UserProfile | null>(null);
  readonly profile = this._profile.asReadonly();

  loadProfile(): void {
    this.http.get<UserProfile>('/api/users/me').subscribe({
      next: (profile) => this._profile.set(profile),
    });
  }

  updateDisplayName(displayName: string): Observable<UserProfile> {
    const body: UpdateDisplayNameRequest = { displayName };
    return this.http.patch<UserProfile>('/api/users/me', body).pipe(
      tap((updated) => {
        this._profile.set(updated);
        this.auth.updateDisplayName(updated.displayName);
      }),
    );
  }
}
