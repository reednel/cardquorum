import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let httpTesting: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpTesting?.verify();
  });

  it('should return true when authenticated', async () => {
    setup();
    const authService = TestBed.inject(AuthService);

    // Hydrate user via login
    authService.login({ username: 'test', password: 'pass' }).subscribe();
    httpTesting.expectOne('/api/auth/login').flush({ userId: 1, displayName: 'Test' });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(result).toBe(true);
  });

  it('should return UrlTree to /login when not authenticated', () => {
    setup();

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(result).toBeInstanceOf(UrlTree);

    const router = TestBed.inject(Router);
    expect((result as UrlTree).toString()).toBe(router.createUrlTree(['/login']).toString());
  });
});
