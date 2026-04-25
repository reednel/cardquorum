import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RoomResponse, RosterMember } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { GameService } from '../game/game.service';
import { ThemeService } from '../shell/theme.service';
import { WebSocketService } from '../websocket.service';
import { RoomContextService } from './room-context.service';
import { RoomMembersTab } from './room-members-tab';
import { RoomService } from './room.service';
import { RosterService } from './roster.service';

function makeMember(
  userId: number,
  section: 'players' | 'spectators',
  position: number,
  username?: string,
): RosterMember {
  return {
    userId,
    username: username ?? `user${userId}`,
    displayName: null,
    section,
    position,
    assignedHue: null,
  };
}

const OWNER_ID = 10;

function makeRoom(overrides: Partial<RoomResponse> = {}): RoomResponse {
  return {
    id: 42,
    name: 'Test Room',
    description: null,
    ownerId: OWNER_ID,
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
    ...overrides,
  };
}

describe('RoomMembersTab', () => {
  let fixture: ComponentFixture<RoomMembersTab>;
  let el: HTMLElement;

  const playersSignal = signal<RosterMember[]>([]);
  const spectatorsSignal = signal<RosterMember[]>([]);
  const rotateSignal = signal(false);

  const mockRosterService = {
    players: playersSignal,
    spectators: spectatorsSignal,
    rotatePlayers: rotateSignal,
    reorderRoster: jest.fn().mockReturnValue(of({})),
    kickUser: jest.fn().mockReturnValue(of({})),
    toggleRotate: jest.fn().mockReturnValue(of({})),
  };

  const membersSignal = signal<{ userId: number; username: string; displayName: string | null }[]>(
    [],
  );
  const mockRoomContext = {
    members: membersSignal,
  };

  const sessionIdSignal = signal<number | null>(null);
  const mockGameService = {
    sessionId: sessionIdSignal,
  };

  const userSignal = signal<{
    userId: number;
    username: string;
    displayName: string | null;
  } | null>(null);
  const mockAuthService = {
    user: userSignal,
  };

  const mockRoomService = {
    getInvites: jest.fn().mockReturnValue(of([])),
    getBans: jest.fn().mockReturnValue(of([])),
    banUser: jest.fn().mockReturnValue(of({})),
    uninviteUser: jest.fn().mockReturnValue(of({})),
    unbanUser: jest.fn().mockReturnValue(of({})),
    inviteUser: jest.fn().mockReturnValue(of({})),
  };

  const mockHttpClient = {
    get: jest.fn().mockReturnValue(of([])),
  };

  const mockWsService = {
    on: jest.fn().mockReturnValue(() => {
      /* empty */
    }),
  };

  const mockThemeService = {
    darkMode: signal(false),
  };

  function setup(opts: { userId?: number; room?: Partial<RoomResponse> } = {}) {
    const userId = opts.userId ?? OWNER_ID;
    userSignal.set({ userId, username: `user${userId}`, displayName: null });

    fixture = TestBed.createComponent(RoomMembersTab);
    fixture.componentRef.setInput('room', makeRoom(opts.room));
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    playersSignal.set([]);
    spectatorsSignal.set([]);
    rotateSignal.set(false);
    membersSignal.set([]);
    sessionIdSignal.set(null);
    userSignal.set(null);

    await TestBed.configureTestingModule({
      imports: [RoomMembersTab],
      providers: [
        { provide: RosterService, useValue: mockRosterService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: GameService, useValue: mockGameService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: WebSocketService, useValue: mockWsService },
        { provide: ThemeService, useValue: mockThemeService },
      ],
    }).compileComponents();
  });

  // --- Status dot tooltip and aria-label (Req 2.1, 2.2, 2.3) ---

  it('shows "In room" tooltip and aria-label for online member', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    membersSignal.set([{ userId: 1, username: 'user1', displayName: null }]);
    setup();

    const dot = el.querySelector('[data-testid="status-dot-1"]') as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('title')).toBe('In room');
    expect(dot.getAttribute('aria-label')).toBe('In room');
  });

  it('shows "Not in room" tooltip and aria-label for offline member', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    membersSignal.set([]); // user 1 not online
    setup();

    const dot = el.querySelector('[data-testid="status-dot-1"]') as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('title')).toBe('Not in room');
    expect(dot.getAttribute('aria-label')).toBe('Not in room');
  });

  // --- Section headers order (Req 3.1, 3.2, 3.3) ---

  it('renders Players section header above Spectators section header', () => {
    setup();

    const playersHeader = el.querySelector('[data-testid="players-section"]') as HTMLElement;
    const spectatorsHeader = el.querySelector('[data-testid="spectators-section"]') as HTMLElement;
    expect(playersHeader).toBeTruthy();
    expect(spectatorsHeader).toBeTruthy();

    // Players should come before Spectators in DOM order
    const order = playersHeader.compareDocumentPosition(spectatorsHeader);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // --- Invited section visibility (Req 4.1, 4.5) ---

  it('shows invited section for invite-only rooms with pending invites', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    mockRoomService.getInvites.mockReturnValue(
      of([{ userId: 99, username: 'invitee', displayName: null, invitedAt: '2026-01-01' }]),
    );
    setup({ room: { visibility: 'invite-only' } });

    // Trigger loadData to fetch invites
    fixture.componentInstance.loadData();
    fixture.detectChanges();

    const invitedSection = el.querySelector('[data-testid="invited-section"]');
    expect(invitedSection).toBeTruthy();
  });

  it('hides invited section for public rooms', () => {
    setup({ room: { visibility: 'public' } });

    const invitedSection = el.querySelector('[data-testid="invited-section"]');
    expect(invitedSection).toBeFalsy();
  });

  // --- Overflow menu visibility (Req 8.1, 8.4) ---

  it('shows overflow menu for owner on non-owner roster members', () => {
    playersSignal.set([
      makeMember(OWNER_ID, 'players', 0, 'alice'),
      makeMember(2, 'players', 1, 'bob'),
    ]);
    setup({ userId: OWNER_ID });

    const triggers = el.querySelectorAll('[data-testid="overflow-trigger"]');
    // Should have overflow for bob (non-owner), not for alice (owner)
    expect(triggers.length).toBe(1);
  });

  it('hides overflow menu for non-owner users', () => {
    playersSignal.set([
      makeMember(OWNER_ID, 'players', 0, 'alice'),
      makeMember(2, 'players', 1, 'bob'),
    ]);
    setup({ userId: 2 }); // non-owner

    const triggers = el.querySelectorAll('[data-testid="overflow-trigger"]');
    expect(triggers.length).toBe(0);
  });

  // --- Drag-drop enabled/disabled (Req 9.1, 9.2) ---

  it('enables drag-drop for owner when no game is active', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    sessionIdSignal.set(null);
    setup({ userId: OWNER_ID });

    const playersList = el.querySelector('[data-testid="players-list"]') as HTMLElement;
    // When drag is enabled, cdkDropListDisabled should NOT be present or be false
    expect(playersList.classList.contains('cdk-drop-list-disabled')).toBe(false);
  });

  it('disables drag-drop for non-owner', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    setup({ userId: 2 });

    const playersList = el.querySelector('[data-testid="players-list"]') as HTMLElement;
    expect(playersList.classList.contains('cdk-drop-list-disabled')).toBe(true);
  });

  it('disables drag-drop when game is active even for owner', () => {
    playersSignal.set([makeMember(1, 'players', 0)]);
    sessionIdSignal.set(99);
    setup({ userId: OWNER_ID });

    const playersList = el.querySelector('[data-testid="players-list"]') as HTMLElement;
    expect(playersList.classList.contains('cdk-drop-list-disabled')).toBe(true);
  });

  // --- Rotate toggle visibility (Req 11.1, 11.2) ---

  it('shows rotate toggle for owner', () => {
    setup({ userId: OWNER_ID });

    const toggle = el.querySelector('[data-testid="rotate-toggle"]');
    expect(toggle).toBeTruthy();
  });

  it('hides rotate toggle for non-owner', () => {
    setup({ userId: 2 });

    const toggle = el.querySelector('[data-testid="rotate-toggle"]');
    expect(toggle).toBeFalsy();
  });
});
