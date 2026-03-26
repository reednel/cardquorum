import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserProfile } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { UserService } from './user.service';

const PROFILE: UserProfile = {
  userId: 1,
  username: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;
  let mockAuthService: { updateDisplayName: jest.Mock; clearLocalState: jest.Mock };

  beforeEach(() => {
    mockAuthService = { updateDisplayName: jest.fn(), clearLocalState: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('profile is initially null', () => {
    expect(service.profile()).toBeNull();
  });

  it('loadProfile fetches and sets profile signal', () => {
    service.loadProfile();
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('GET');
    req.flush(PROFILE);
    expect(service.profile()).toEqual(PROFILE);
  });

  it('updateDisplayName patches and updates profile + auth', () => {
    // seed profile first
    service.loadProfile();
    http.expectOne('/api/users/me').flush(PROFILE);

    const updated = { ...PROFILE, displayName: 'Alice2' };
    service.updateDisplayName('Alice2').subscribe();

    const req = http.expectOne('/api/users/me/display-name');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Alice2' });
    req.flush(updated);

    expect(service.profile()).toEqual(updated);
    expect(mockAuthService.updateDisplayName).toHaveBeenCalledWith('Alice2');
  });

  it('deleteAccount deletes with password and calls auth.clearLocalState', () => {
    service.deleteAccount('mypassword123').subscribe();

    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 'mypassword123' });
    req.flush(null);

    expect(mockAuthService.clearLocalState).toHaveBeenCalled();
  });
});
