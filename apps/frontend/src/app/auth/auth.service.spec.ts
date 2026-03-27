import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should start unauthenticated', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  describe('login', () => {
    it('should POST and set user from response', () => {
      let completed = false;
      service.login({ username: 'bob', password: 'pass' }).subscribe(() => {
        completed = true;
      });

      const req = httpTesting.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'bob', password: 'pass' });
      req.flush({ userId: 7, username: 'bob', displayName: 'Bob' });

      expect(completed).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()).toEqual({ userId: 7, username: 'bob', displayName: 'Bob' });
    });
  });

  describe('register', () => {
    it('should POST and set user from response', () => {
      let completed = false;
      service.register({ username: 'carol', password: 'pass' }).subscribe(() => {
        completed = true;
      });

      const req = httpTesting.expectOne('/api/auth/register');
      expect(req.request.method).toBe('POST');
      req.flush({ userId: 8, username: 'carol', displayName: null });

      expect(completed).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()).toEqual({ userId: 8, username: 'carol', displayName: null });
    });
  });

  describe('initialize', () => {
    it('should hydrate user from /api/auth/me', async () => {
      const promise = service.initialize();

      httpTesting.expectOne('/api/auth/strategies').flush({ strategies: ['basic'] });
      const req = httpTesting.expectOne('/api/auth/me');
      expect(req.request.method).toBe('GET');
      req.flush({ userId: 42, username: 'alice', displayName: 'Alice' });

      await promise;
      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()).toEqual({ userId: 42, username: 'alice', displayName: 'Alice' });
    });

    it('should remain unauthenticated on 401', async () => {
      const promise = service.initialize();

      httpTesting.expectOne('/api/auth/strategies').flush({ strategies: ['basic'] });
      const req = httpTesting.expectOne('/api/auth/me');
      req.flush('', { status: 401, statusText: 'Unauthorized' });

      await promise;
      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
    });
  });

  describe('loadStrategies', () => {
    it('should fetch and store strategies', () => {
      service.loadStrategies();
      const req = httpTesting.expectOne('/api/auth/strategies');
      req.flush({ strategies: ['basic', 'oidc'] });
      expect(service.strategies()).toEqual(['basic', 'oidc']);
    });

    it('should default to basic on error', () => {
      service.loadStrategies();
      httpTesting
        .expectOne('/api/auth/strategies')
        .flush('err', { status: 500, statusText: 'Error' });
      expect(service.strategies()).toEqual(['basic']);
    });
  });

  describe('loadCredentials', () => {
    it('should fetch and store credential methods', () => {
      service.loadCredentials();
      const req = httpTesting.expectOne('/api/auth/credentials');
      expect(req.request.method).toBe('GET');
      req.flush({ methods: ['basic', 'oidc'] });
      expect(service.credentials()).toEqual(['basic', 'oidc']);
    });

    it('should default to empty array on error', () => {
      service.loadCredentials();
      httpTesting
        .expectOne('/api/auth/credentials')
        .flush('err', { status: 500, statusText: 'Error' });
      expect(service.credentials()).toEqual([]);
    });
  });

  describe('linkBasicCredential', () => {
    it('should POST password and refresh credentials', () => {
      let completed = false;
      service.linkBasicCredential('newpass').subscribe(() => {
        completed = true;
      });

      const req = httpTesting.expectOne('/api/auth/credentials/basic');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ password: 'newpass' });
      req.flush(null, { status: 204, statusText: 'No Content' });

      // Should trigger a credentials refresh
      const refreshReq = httpTesting.expectOne('/api/auth/credentials');
      refreshReq.flush({ methods: ['basic', 'oidc'] });

      expect(completed).toBe(true);
    });
  });

  describe('unlinkBasicCredential', () => {
    it('should DELETE with password and refresh credentials', () => {
      let completed = false;
      service.unlinkBasicCredential('mypass').subscribe(() => {
        completed = true;
      });

      const req = httpTesting.expectOne('/api/auth/credentials/basic');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual({ password: 'mypass' });
      req.flush(null, { status: 204, statusText: 'No Content' });

      const refreshReq = httpTesting.expectOne('/api/auth/credentials');
      refreshReq.flush({ methods: ['oidc'] });

      expect(completed).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear user, POST logout, and navigate to /login', () => {
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      // Login first
      service.login({ username: 'test', password: 'pass' }).subscribe();
      httpTesting
        .expectOne('/api/auth/login')
        .flush({ userId: 1, username: 'test', displayName: 'Test' });
      expect(service.isAuthenticated()).toBe(true);

      // Set credentials to verify they get cleared
      service.loadCredentials();
      httpTesting.expectOne('/api/auth/credentials').flush({ methods: ['basic'] });
      expect(service.credentials()).toEqual(['basic']);

      // Logout
      service.logout();

      // Fire-and-forget POST to /api/auth/logout
      const logoutReq = httpTesting.expectOne('/api/auth/logout');
      expect(logoutReq.request.method).toBe('POST');
      logoutReq.flush({ ok: true });

      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      expect(service.credentials()).toEqual([]);
    });
  });

  describe('logout re-entrancy guard', () => {
    it('should be a no-op when user is already null', () => {
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      // User is already null (not logged in)
      service.logout();

      // No HTTP POST, no navigation
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  describe('oidcRegister', () => {
    it('should PATCH and set user', () => {
      let completed = false;
      service.oidcRegister({ username: 'newname' }).subscribe(() => {
        completed = true;
      });

      const req = httpTesting.expectOne('/api/auth/oidc/register');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ username: 'newname' });
      req.flush({ userId: 1, username: 'newname', displayName: null, authMethod: 'oidc' });

      expect(completed).toBe(true);
      expect(service.user()?.username).toBe('newname');
      expect(service.user()?.authMethod).toBe('oidc');
    });
  });

  describe('updateUsername', () => {
    it('should update user signal with new username', () => {
      // Login first to set user
      service.login({ username: 'old', password: 'pass' }).subscribe();
      httpTesting
        .expectOne('/api/auth/login')
        .flush({ userId: 1, username: 'old', displayName: null });

      service.updateUsername('newname');

      expect(service.user()).toEqual({ userId: 1, username: 'newname', displayName: null });
    });

    it('should be a no-op when user is null', () => {
      service.updateUsername('newname');
      expect(service.user()).toBeNull();
    });
  });

  describe('updateDisplayName', () => {
    it('should update user signal with new displayName', () => {
      service.login({ username: 'alice', password: 'pass' }).subscribe();
      httpTesting
        .expectOne('/api/auth/login')
        .flush({ userId: 1, username: 'alice', displayName: null });

      service.updateDisplayName('Alice');

      expect(service.user()).toEqual({ userId: 1, username: 'alice', displayName: 'Alice' });
    });

    it('should allow setting displayName to null', () => {
      service.login({ username: 'alice', password: 'pass' }).subscribe();
      httpTesting
        .expectOne('/api/auth/login')
        .flush({ userId: 1, username: 'alice', displayName: 'Alice' });

      service.updateDisplayName(null);

      expect(service.user()).toEqual({ userId: 1, username: 'alice', displayName: null });
    });
  });

  describe('clearLocalState', () => {
    it('should clear user and disconnect without calling server', () => {
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      // Login first
      service.login({ username: 'test', password: 'pass' }).subscribe();
      httpTesting
        .expectOne('/api/auth/login')
        .flush({ userId: 1, username: 'test', displayName: 'Test' });
      expect(service.isAuthenticated()).toBe(true);

      // Set credentials to verify they get cleared
      service.loadCredentials();
      httpTesting.expectOne('/api/auth/credentials').flush({ methods: ['basic'] });
      expect(service.credentials()).toEqual(['basic']);

      // Clear local state
      service.clearLocalState();

      // Should NOT make a POST to /api/auth/logout
      httpTesting.expectNone('/api/auth/logout');

      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      expect(service.credentials()).toEqual([]);
    });

    it('should be a no-op when user is already null', () => {
      const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

      service.clearLocalState();

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
