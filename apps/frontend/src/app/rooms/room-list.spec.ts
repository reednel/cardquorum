import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { RoomList } from './room-list';
import { RoomService } from './room.service';

const ROOMS: RoomResponse[] = [
  {
    id: 1,
    name: 'My Room',
    ownerId: 10,
    ownerDisplayName: 'Alice',
    visibility: 'public',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    onlineCount: 3,
  },
  {
    id: 2,
    name: 'Other Room',
    ownerId: 20,
    ownerDisplayName: 'Bob',
    visibility: 'friends-only',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    onlineCount: 0,
  },
];

describe('RoomList', () => {
  let fixture: ComponentFixture<RoomList>;
  let el: HTMLElement;
  let router: Router;

  const roomsSignal = signal<RoomResponse[]>([]);
  const loadingSignal = signal(false);
  const errorSignal = signal<string | null>(null);

  const mockRoomService = {
    rooms: roomsSignal.asReadonly(),
    loading: loadingSignal.asReadonly(),
    error: errorSignal.asReadonly(),
    loadRooms: jest.fn(),
  };

  const mockAuthService = {
    user: signal({ userId: 10, displayName: 'Alice' }),
  };

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    roomsSignal.set([]);
    loadingSignal.set(false);
    errorSignal.set(null);
    mockRoomService.loadRooms.mockClear();

    await TestBed.configureTestingModule({
      imports: [RoomList],
      providers: [
        provideRouter([]),
        { provide: RoomService, useValue: mockRoomService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomList);
    router = TestBed.inject(Router);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('calls loadRooms on init', () => {
    expect(mockRoomService.loadRooms).toHaveBeenCalled();
  });

  it('renders room rows', () => {
    roomsSignal.set(ROOMS);
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-testid="room-row"]');
    expect(rows.length).toBe(2);
  });

  it('shows config button for owned rooms, join for all rooms', () => {
    roomsSignal.set(ROOMS);
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-testid="room-row"]');
    expect(rows[0].querySelector('[data-testid="config-btn"]')).toBeTruthy();
    expect(rows[0].querySelector('[data-testid="join-btn"]')).toBeTruthy();
    expect(rows[1].querySelector('[data-testid="join-btn"]')).toBeTruthy();
    expect(rows[1].querySelector('[data-testid="config-btn"]')).toBeFalsy();
  });

  it('shows empty state when no rooms', () => {
    roomsSignal.set([]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="empty-rooms"]')).toBeTruthy();
  });

  it('shows create room modal on button click', () => {
    const btn = el.querySelector('[data-testid="create-room-btn"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    fixture.detectChanges();
    expect(el.querySelector('dialog')).toBeTruthy();
  });

  it('shows error state with retry button on load failure', () => {
    errorSignal.set('Failed to load rooms');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="error-state"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="retry-btn"]')).toBeTruthy();
  });
});
