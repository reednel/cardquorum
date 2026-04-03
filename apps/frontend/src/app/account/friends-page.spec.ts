import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  BlockedUserResponse,
  FriendRequestResponse,
  FriendshipResponse,
  UserSearchResult,
} from '@cardquorum/shared';
import { BlockService } from './block.service';
import { FriendService } from './friend.service';
import { FriendsPage } from './friends-page';

const FRIEND: FriendshipResponse = {
  friendshipId: 1,
  user: { userId: 2, username: 'bob', displayName: 'Bob' },
  createdAt: '2026-01-01T00:00:00Z',
};

const INCOMING: FriendRequestResponse = {
  requestId: 3,
  user: { userId: 4, username: 'carol', displayName: 'Carol' },
  createdAt: '2026-01-02T00:00:00Z',
};

const OUTGOING: FriendRequestResponse = {
  requestId: 5,
  user: { userId: 6, username: 'eve', displayName: 'Eve' },
  createdAt: '2026-01-03T00:00:00Z',
};

const SEARCH_RESULT: UserSearchResult = {
  userId: 7,
  username: 'frank',
  displayName: 'Frank',
};

const BLOCKED: BlockedUserResponse = {
  userId: 9,
  username: 'eve',
  displayName: 'Eve',
  blockedAt: '2026-03-27T00:00:00Z',
};

describe('FriendsPage', () => {
  let fixture: ComponentFixture<FriendsPage>;
  let el: HTMLElement;

  const friendsSignal = signal<FriendshipResponse[]>([]);
  const incomingSignal = signal<FriendRequestResponse[]>([]);
  const outgoingSignal = signal<FriendRequestResponse[]>([]);
  const searchSignal = signal<UserSearchResult[]>([]);
  const blockedSignal = signal<BlockedUserResponse[]>([]);

  const mockFriendService = {
    friends: friendsSignal.asReadonly(),
    incomingRequests: incomingSignal.asReadonly(),
    outgoingRequests: outgoingSignal.asReadonly(),
    searchResults: searchSignal.asReadonly(),
    loadFriends: jest.fn(),
    loadIncomingRequests: jest.fn(),
    loadOutgoingRequests: jest.fn(),
    searchUsers: jest.fn(),
    sendRequest: jest.fn(),
    acceptRequest: jest.fn(),
    denyRequest: jest.fn(),
    cancelRequest: jest.fn(),
    removeFriend: jest.fn(),
  };

  const mockBlockService = {
    blockedUsers: blockedSignal.asReadonly(),
    loadBlockedUsers: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
  };

  beforeEach(async () => {
    friendsSignal.set([]);
    incomingSignal.set([]);
    outgoingSignal.set([]);
    searchSignal.set([]);
    blockedSignal.set([]);
    Object.values(mockFriendService).forEach((v) => {
      if (typeof v === 'function' && 'mockClear' in v) (v as jest.Mock).mockClear();
    });
    Object.values(mockBlockService).forEach((v) => {
      if (typeof v === 'function' && 'mockClear' in v) (v as jest.Mock).mockClear();
    });

    await TestBed.configureTestingModule({
      imports: [FriendsPage],
      providers: [
        provideRouter([]),
        { provide: FriendService, useValue: mockFriendService },
        { provide: BlockService, useValue: mockBlockService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FriendsPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('loads all lists on init', () => {
    expect(mockBlockService.loadBlockedUsers).toHaveBeenCalled();
    expect(mockFriendService.loadFriends).toHaveBeenCalled();
    expect(mockFriendService.loadIncomingRequests).toHaveBeenCalled();
    expect(mockFriendService.loadOutgoingRequests).toHaveBeenCalled();
  });

  it('shows empty states when no data', () => {
    expect(el.querySelector('[data-testid="empty-incoming"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="empty-outgoing"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="empty-friends"]')).toBeTruthy();
  });

  it('renders friends list', () => {
    friendsSignal.set([FRIEND]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="friends-heading"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="remove-btn-1"]')).toBeTruthy();
  });

  it('renders incoming requests with accept/deny buttons', () => {
    incomingSignal.set([INCOMING]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="accept-btn-3"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="deny-btn-3"]')).toBeTruthy();
  });

  it('renders outgoing requests with cancel button', () => {
    outgoingSignal.set([OUTGOING]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="cancel-btn-5"]')).toBeTruthy();
  });

  it('accept calls acceptRequest', () => {
    mockFriendService.acceptRequest.mockReturnValue(of({}));
    incomingSignal.set([INCOMING]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="accept-btn-3"]') as HTMLButtonElement).click();
    expect(mockFriendService.acceptRequest).toHaveBeenCalledWith(3);
  });

  it('deny calls denyRequest', () => {
    mockFriendService.denyRequest.mockReturnValue(of({}));
    incomingSignal.set([INCOMING]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="deny-btn-3"]') as HTMLButtonElement).click();
    expect(mockFriendService.denyRequest).toHaveBeenCalledWith(3);
  });

  it('cancel calls cancelRequest', () => {
    mockFriendService.cancelRequest.mockReturnValue(of({}));
    outgoingSignal.set([OUTGOING]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="cancel-btn-5"]') as HTMLButtonElement).click();
    expect(mockFriendService.cancelRequest).toHaveBeenCalledWith(5);
  });

  it('search triggers after debounce', () => {
    jest.useFakeTimers();
    const input = el.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    input.value = 'fra';
    input.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(300);
    expect(mockFriendService.searchUsers).toHaveBeenCalledWith('fra');
    jest.useRealTimers();
  });

  it('shows search results with add button', () => {
    searchSignal.set([SEARCH_RESULT]);
    fixture.detectChanges();

    expect(el.textContent).toContain('Frank');
    expect(el.querySelector('[data-testid="add-friend-btn-7"]')).toBeTruthy();
  });

  it('sendRequest calls service on add button click', () => {
    mockFriendService.sendRequest.mockReturnValue(of({}));
    searchSignal.set([SEARCH_RESULT]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="add-friend-btn-7"]') as HTMLButtonElement).click();
    expect(mockFriendService.sendRequest).toHaveBeenCalledWith(7);
  });

  it('remove friend shows confirmation step', () => {
    mockFriendService.removeFriend.mockReturnValue(of({}));
    friendsSignal.set([FRIEND]);
    fixture.detectChanges();

    const removeBtn = el.querySelector('[data-testid="remove-btn-1"]') as HTMLButtonElement;
    removeBtn.click();
    fixture.detectChanges();

    const confirmBtn = el.querySelector(
      '[data-testid="confirm-remove-btn-1"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
  });

  it('shows blocked users section when expanded', () => {
    blockedSignal.set([BLOCKED]);
    fixture.detectChanges();

    const toggleBtn = el.querySelector('[data-testid="toggle-blocked"]') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();

    toggleBtn.click();
    fixture.detectChanges();

    const unblockBtn = el.querySelector('[data-testid="unblock-btn-9"]');
    expect(unblockBtn).toBeTruthy();
  });

  it('does not show blocked users section when empty', () => {
    blockedSignal.set([]);
    fixture.detectChanges();

    const toggleBtn = el.querySelector('[data-testid="toggle-blocked"]');
    expect(toggleBtn).toBeFalsy();
  });

  it('unblock shows confirmation step', () => {
    mockBlockService.unblockUser.mockReturnValue(of({}));
    blockedSignal.set([BLOCKED]);
    fixture.detectChanges();

    const toggleBtn = el.querySelector('[data-testid="toggle-blocked"]') as HTMLButtonElement;
    toggleBtn.click();
    fixture.detectChanges();

    const unblockBtn = el.querySelector('[data-testid="unblock-btn-9"]') as HTMLButtonElement;
    unblockBtn.click();
    fixture.detectChanges();

    const confirmBtn = el.querySelector(
      '[data-testid="confirm-unblock-btn-9"]',
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
  });

  it('shows block button in search results for unknown users', () => {
    searchSignal.set([SEARCH_RESULT]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="block-search-btn-7"]')).toBeTruthy();
  });

  it('shows block button next to friends', () => {
    friendsSignal.set([FRIEND]);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="block-friend-btn-2"]')).toBeTruthy();
  });

  it('blockUser calls blockService', () => {
    mockBlockService.blockUser.mockReturnValue(of({}));
    searchSignal.set([SEARCH_RESULT]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="block-search-btn-7"]') as HTMLButtonElement).click();
    expect(mockBlockService.blockUser).toHaveBeenCalledWith(7);
  });
});
