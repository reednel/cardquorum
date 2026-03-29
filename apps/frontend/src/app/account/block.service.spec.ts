import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BlockedUserResponse } from '@cardquorum/shared';
import { BlockService } from './block.service';
import { FriendService } from './friend.service';

const BLOCKED_USER: BlockedUserResponse = {
  userId: 5,
  username: 'eve',
  displayName: 'Eve',
  blockedAt: '2026-03-27T00:00:00Z',
};

describe('BlockService', () => {
  let service: BlockService;
  let http: HttpTestingController;
  let friendService: FriendService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BlockService);
    http = TestBed.inject(HttpTestingController);
    friendService = TestBed.inject(FriendService);
  });

  afterEach(() => http.verify());

  it('blockedUsers is initially empty', () => {
    expect(service.blockedUsers()).toEqual([]);
  });

  it('loadBlockedUsers fetches and sets signal', () => {
    service.loadBlockedUsers();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('GET');
    req.flush([BLOCKED_USER]);
    expect(service.blockedUsers()).toEqual([BLOCKED_USER]);
  });

  it('blockUser posts and refreshes lists', () => {
    service.blockUser(5).subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 5 });
    req.flush(BLOCKED_USER);

    // Should trigger refreshes
    http.expectOne('/api/blocks').flush([BLOCKED_USER]);
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests/incoming').flush([]);
    http.expectOne('/api/friends/requests/outgoing').flush([]);
  });

  it('unblockUser deletes and refreshes lists', () => {
    service.unblockUser(5).subscribe();
    const req = http.expectOne('/api/blocks/5');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    // Should trigger refreshes
    http.expectOne('/api/blocks').flush([]);
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests/incoming').flush([]);
    http.expectOne('/api/friends/requests/outgoing').flush([]);
  });
});
