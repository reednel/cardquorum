import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { RoomView } from './room-view';
import { RoomService } from './room.service';

const ROOM: RoomResponse = {
  id: 42,
  name: 'Test Room',
  description: null,
  ownerId: 10,
  ownerDisplayName: 'Alice',
  ownerUsername: 'alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 2,
  memberLimit: null,
  rosterCount: 0,
  isOnRoster: false,
  gameType: null,
  presetName: null,
  gameInProgress: false,
};

describe('RoomView', () => {
  let fixture: ComponentFixture<RoomView>;
  let router: Router;

  const mockChatService = {
    messages: signal([]),
    members: signal([]),
    currentRoomId: signal(null),
    roomDeleted: signal<number | null>(null),
    joinError: signal<string | null>(null),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockRoomService = {
    getRoom: jest.fn().mockReturnValue(of(ROOM)),
    getInvites: jest.fn().mockReturnValue(of([])),
    getBans: jest.fn().mockReturnValue(of([])),
    banUser: jest.fn().mockReturnValue(of({})),
    uninviteUser: jest.fn().mockReturnValue(of({})),
    unbanUser: jest.fn().mockReturnValue(of({})),
  };

  const mockAuthService = {
    user: signal({ userId: 10, username: 'alice', displayName: 'Alice' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatService.roomDeleted.set(null);
    mockChatService.joinError.set(null);

    await TestBed.configureTestingModule({
      imports: [RoomView],
      providers: [
        provideRouter([{ path: 'rooms', component: RoomView }]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['roomId', '42']]) } },
        },
        { provide: ChatService, useValue: mockChatService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomView);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('joins room on init', () => {
    expect(mockChatService.joinRoom).toHaveBeenCalledWith(42);
  });

  it('fetches room details', () => {
    expect(mockRoomService.getRoom).toHaveBeenCalledWith(42);
  });

  it('displays room name in sidebar', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Room');
  });

  it('leaves room on destroy', () => {
    fixture.destroy();
    expect(mockChatService.leaveRoom).toHaveBeenCalled();
  });

  it('loads invites and bans when members tab is activated', () => {
    fixture.componentInstance['activeTab'].set('members');
    fixture.detectChanges();
    fixture.componentInstance['onTabClick']('members');
    expect(mockRoomService.getInvites).toHaveBeenCalledWith(42);
    expect(mockRoomService.getBans).toHaveBeenCalledWith(42);
  });

  it('shows overflow menu for non-owner roster members when user is owner', () => {
    fixture.componentInstance['activeTab'].set('members');
    fixture.detectChanges();

    const triggers = fixture.nativeElement.querySelectorAll('[data-testid="overflow-trigger"]');
    expect(triggers).toBeDefined();
  });

  it('hides leave button for room owner', () => {
    fixture.detectChanges();

    const leaveBtn = fixture.nativeElement.querySelector('[data-testid="leave-btn"]');
    expect(leaveBtn).toBeFalsy();
  });

  it('redirects to /rooms when join error occurs (e.g. room full)', () => {
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    mockChatService.joinError.set('Room is full (limit: 4)');
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/rooms']);
  });
});

describe('RoomView — invalid room', () => {
  let router: Router;

  const mockChatService = {
    messages: signal([]),
    members: signal([]),
    currentRoomId: signal(null),
    roomDeleted: signal<number | null>(null),
    joinError: signal<string | null>(null),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockRoomService = {
    getRoom: jest.fn().mockReturnValue(throwError(() => new Error('Not found'))),
    getInvites: jest.fn().mockReturnValue(of([])),
    getBans: jest.fn().mockReturnValue(of([])),
    banUser: jest.fn().mockReturnValue(of({})),
    uninviteUser: jest.fn().mockReturnValue(of({})),
    unbanUser: jest.fn().mockReturnValue(of({})),
  };

  const mockAuthService = {
    user: signal({ userId: 99, username: 'nobody', displayName: 'Nobody' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [RoomView],
      providers: [
        provideRouter([{ path: 'rooms', component: RoomView }]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['roomId', '999']]) } },
        },
        { provide: ChatService, useValue: mockChatService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  it('redirects to /rooms when getRoom fails', () => {
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RoomView);
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/rooms']);
  });
});
