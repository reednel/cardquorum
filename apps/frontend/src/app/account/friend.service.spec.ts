import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FriendshipResponse, UserSearchResult } from '@cardquorum/shared';
import { FriendService } from './friend.service';

const FRIEND: FriendshipResponse = {
  friendshipId: 1,
  user: { userId: 2, username: 'bob', displayName: 'Bob' },
  status: 'accepted',
  createdAt: '2026-01-01T00:00:00Z',
};

const INCOMING: FriendshipResponse = {
  friendshipId: 3,
  user: { userId: 4, username: 'carol', displayName: 'Carol' },
  status: 'pending',
  createdAt: '2026-01-02T00:00:00Z',
};

const SEARCH_RESULT: UserSearchResult = {
  userId: 5,
  username: 'dave',
  displayName: 'Dave',
};

describe('FriendService', () => {
  let service: FriendService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FriendService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('friends is initially empty', () => {
    expect(service.friends()).toEqual([]);
  });

  it('loadFriends fetches and sets friends signal', () => {
    service.loadFriends();
    const req = http.expectOne('/api/friends');
    expect(req.request.method).toBe('GET');
    req.flush([FRIEND]);
    expect(service.friends()).toEqual([FRIEND]);
  });

  it('loadIncomingRequests fetches incoming', () => {
    service.loadIncomingRequests();
    const req = http.expectOne('/api/friends/requests/incoming');
    expect(req.request.method).toBe('GET');
    req.flush([INCOMING]);
    expect(service.incomingRequests()).toEqual([INCOMING]);
  });

  it('loadOutgoingRequests fetches outgoing', () => {
    service.loadOutgoingRequests();
    const req = http.expectOne('/api/friends/requests/outgoing');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(service.outgoingRequests()).toEqual([]);
  });

  it('searchUsers fetches and sets searchResults', () => {
    service.searchUsers('dav');
    const req = http.expectOne('/api/users/search?q=dav');
    expect(req.request.method).toBe('GET');
    req.flush([SEARCH_RESULT]);
    expect(service.searchResults()).toEqual([SEARCH_RESULT]);
  });

  it('searchUsers clears results for empty query', () => {
    service.searchUsers('dav');
    http.expectOne('/api/users/search?q=dav').flush([SEARCH_RESULT]);
    expect(service.searchResults().length).toBe(1);

    service.searchUsers('');
    expect(service.searchResults()).toEqual([]);
  });

  it('sendRequest posts and refreshes outgoing', () => {
    service.sendRequest(5).subscribe();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 5 });
    req.flush(INCOMING);
    http.expectOne('/api/friends/requests/outgoing').flush([]);
  });

  it('acceptRequest posts and refreshes incoming + friends', () => {
    service.acceptRequest(3).subscribe();
    const req = http.expectOne('/api/friends/requests/3/accept');
    expect(req.request.method).toBe('POST');
    req.flush({});
    http.expectOne('/api/friends/requests/incoming').flush([]);
    http.expectOne('/api/friends').flush([FRIEND]);
  });

  it('denyRequest deletes and refreshes incoming', () => {
    service.denyRequest(3).subscribe();
    const req = http.expectOne('/api/friends/requests/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/friends/requests/incoming').flush([]);
  });

  it('cancelRequest deletes and refreshes outgoing', () => {
    service.cancelRequest(3).subscribe();
    const req = http.expectOne('/api/friends/requests/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/friends/requests/outgoing').flush([]);
  });

  it('removeFriend deletes and refreshes friends', () => {
    service.removeFriend(1).subscribe();
    const req = http.expectOne('/api/friends/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/friends').flush([]);
  });
});
