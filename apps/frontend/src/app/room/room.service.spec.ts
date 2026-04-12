import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoomResponse } from '@cardquorum/shared';
import { RoomService } from './room.service';

const ROOM: RoomResponse = {
  id: 1,
  name: 'Test Room',
  description: null,
  ownerId: 10,
  ownerDisplayName: 'Alice',
  ownerUsername: 'alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 3,
  memberLimit: null,
  rosterCount: 0,
  isOnRoster: false,
  gameType: null,
  presetName: null,
  gameInProgress: false,
};

describe('RoomService', () => {
  let service: RoomService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loadRooms fetches and updates rooms signal', () => {
    expect(service.rooms()).toEqual([]);
    expect(service.loading()).toBe(false);

    service.loadRooms();
    expect(service.loading()).toBe(true);

    const req = http.expectOne('/api/rooms');
    expect(req.request.method).toBe('GET');
    req.flush([ROOM]);

    expect(service.rooms()).toEqual([ROOM]);
    expect(service.loading()).toBe(false);
  });

  it('createRoom posts and returns observable', () => {
    service.createRoom({ name: 'New' }).subscribe((res) => {
      expect(res).toEqual(ROOM);
    });

    const req = http.expectOne('/api/rooms');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New' });
    req.flush(ROOM);
  });

  it('updateRoom patches and returns observable', () => {
    service.updateRoom(1, { name: 'Renamed' }).subscribe((res) => {
      expect(res).toEqual({ ...ROOM, name: 'Renamed' });
    });

    const req = http.expectOne('/api/rooms/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Renamed' });
    req.flush({ ...ROOM, name: 'Renamed' });
  });

  it('getRoom fetches single room', () => {
    service.getRoom(1).subscribe((res) => {
      expect(res).toEqual(ROOM);
    });

    const req = http.expectOne('/api/rooms/1');
    expect(req.request.method).toBe('GET');
    req.flush(ROOM);
  });

  it('deleteRoom sends delete request', () => {
    service.deleteRoom(1).subscribe();

    const req = http.expectOne('/api/rooms/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('removeRoomFromList removes by id', () => {
    service.loadRooms();
    http.expectOne('/api/rooms').flush([ROOM, { ...ROOM, id: 2, name: 'Other' }]);

    service.removeRoomFromList(1);
    expect(service.rooms().length).toBe(1);
    expect(service.rooms()[0].id).toBe(2);
  });

  it('loadRooms sets error signal on failure', () => {
    service.loadRooms();
    expect(service.loading()).toBe(true);

    http.expectOne('/api/rooms').flush('', { status: 500, statusText: 'Server Error' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Failed to load rooms');
    expect(service.rooms()).toEqual([]);
  });

  it('loadRooms clears previous error on retry', () => {
    service.loadRooms();
    http.expectOne('/api/rooms').flush('', { status: 500, statusText: 'Server Error' });
    expect(service.error()).toBe('Failed to load rooms');

    service.loadRooms();
    expect(service.error()).toBeNull();
    expect(service.loading()).toBe(true);
    http.expectOne('/api/rooms').flush([ROOM]);
    expect(service.rooms()).toEqual([ROOM]);
  });

  // --- Invite methods ---

  it('getInvites fetches invites for a room', () => {
    const invites = [{ userId: 2, username: 'bob', displayName: 'Bob', invitedAt: 'x' }];
    service.getInvites(1).subscribe((res) => expect(res).toEqual(invites));

    const req = http.expectOne('/api/rooms/1/invites');
    expect(req.request.method).toBe('GET');
    req.flush(invites);
  });

  it('inviteUser posts to invite endpoint', () => {
    service.inviteUser(1, 2).subscribe();

    const req = http.expectOne('/api/rooms/1/invites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 2 });
    req.flush({ success: true });
  });

  it('uninviteUser sends delete to invite endpoint', () => {
    service.uninviteUser(1, 2).subscribe();

    const req = http.expectOne('/api/rooms/1/invites/2');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  // --- Ban methods ---

  it('getBans fetches bans for a room', () => {
    const bans = [{ userId: 3, username: 'carol', displayName: 'Carol', bannedAt: 'x' }];
    service.getBans(1).subscribe((res) => expect(res).toEqual(bans));

    const req = http.expectOne('/api/rooms/1/bans');
    expect(req.request.method).toBe('GET');
    req.flush(bans);
  });

  it('banUser posts to ban endpoint', () => {
    service.banUser(1, 3).subscribe();

    const req = http.expectOne('/api/rooms/1/bans');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 3 });
    req.flush({ success: true });
  });

  it('unbanUser sends delete to ban endpoint', () => {
    service.unbanUser(1, 3).subscribe();

    const req = http.expectOne('/api/rooms/1/bans/3');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });
});
