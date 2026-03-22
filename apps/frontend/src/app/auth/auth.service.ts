import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, map, Observable, tap } from 'rxjs';
import {
  AuthStrategy,
  LoginRequest,
  RegisterRequest,
  StrategiesResponse,
  UserIdentity,
} from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly ws = inject(WebSocketService);

  private readonly _user = signal<UserIdentity | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private readonly _strategies = signal<AuthStrategy[]>(['basic']);
  readonly strategies = this._strategies.asReadonly();

  /** Called by APP_INITIALIZER before the app bootstraps. */
  initialize(): Promise<void> {
    this.loadStrategies();
    return firstValueFrom(
      this.http.get<UserIdentity>('/api/auth/me').pipe(
        tap((user) => this._user.set(user)),
        map(() => undefined),
      ),
    ).catch(() => {
      // 401 or network error — user is not logged in. Guard will redirect.
    });
  }

  loadStrategies(): void {
    this.http.get<StrategiesResponse>('/api/auth/strategies').subscribe({
      next: (res) => this._strategies.set(res.strategies),
      error: () => this._strategies.set(['basic']),
    });
  }

  login(req: LoginRequest): Observable<void> {
    return this.http.post<UserIdentity>('/api/auth/login', req).pipe(
      tap((user) => this._user.set(user)),
      map(() => undefined),
    );
  }

  register(req: RegisterRequest): Observable<void> {
    return this.http.post<UserIdentity>('/api/auth/register', req).pipe(
      tap((user) => this._user.set(user)),
      map(() => undefined),
    );
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe();
    this._user.set(null);
    this.ws.disconnect();
    this.router.navigate(['/login']);
  }
}
