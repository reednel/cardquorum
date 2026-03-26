import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  DeleteAccountRequest,
  UpdateDisplayNameRequest,
  UpdateUsernameRequest,
  UserProfile,
} from '@cardquorum/shared';
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

  updateUsername(username: string): Observable<UserProfile> {
    const body: UpdateUsernameRequest = { username };
    return this.http.patch<UserProfile>('/api/users/me/username', body).pipe(
      tap((updated) => {
        this._profile.set(updated);
        this.auth.updateUsername(updated.username);
      }),
    );
  }

  updateDisplayName(displayName: string | null): Observable<UserProfile> {
    const body: UpdateDisplayNameRequest = { displayName };
    return this.http.patch<UserProfile>('/api/users/me/display-name', body).pipe(
      tap((updated) => {
        this._profile.set(updated);
        this.auth.updateDisplayName(updated.displayName);
      }),
    );
  }

  deleteAccount(password?: string): Observable<void> {
    const body: DeleteAccountRequest = { password };
    return this.http
      .delete<void>('/api/users/me', { body })
      .pipe(tap(() => this.auth.clearLocalState()));
  }
}
