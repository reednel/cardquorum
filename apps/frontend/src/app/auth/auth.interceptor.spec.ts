import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should not add Authorization header (cookie-based auth)', () => {
    http.get('/api/test').subscribe();
    const req = httpTesting.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should redirect to login on 401 for non-auth URLs', () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    // Simulate a logged-in user
    auth.login({ username: 'test', password: 'pass' }).subscribe({
      error: () => {
        /* */
      },
    });
    httpTesting.expectOne('/api/auth/login').flush({ userId: 1, displayName: 'Test' });

    http.get('/api/rooms').subscribe({
      error: () => {
        /* expected */
      },
    });
    httpTesting.expectOne('/api/rooms').flush('', { status: 401, statusText: 'Unauthorized' });

    // logout() fires a fire-and-forget POST
    httpTesting.expectOne('/api/auth/logout').flush({ ok: true });

    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('should redirect to login on 401 for auth endpoints', () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    // Simulate a logged-in user
    auth.login({ username: 'test', password: 'pass' }).subscribe({
      error: () => {
        /* */
      },
    });
    httpTesting.expectOne('/api/auth/login').flush({ userId: 1, displayName: 'Test' });

    http.post('/api/auth/login', {}).subscribe({
      error: () => {
        /* expected */
      },
    });
    httpTesting.expectOne('/api/auth/login').flush('', { status: 401, statusText: 'Unauthorized' });

    // logout() fires a fire-and-forget POST
    httpTesting.expectOne('/api/auth/logout').flush({ ok: true });

    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('should NOT logout on 401 for DELETE /api/users/me', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    http.delete('/api/users/me').subscribe({
      error: () => {
        /* */
      },
    });
    httpTesting.expectOne('/api/users/me').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
