import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { BlockService } from './block.service';
import { FriendService } from './friend.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-friends-page',
  template: `
    <!-- Search -->
    <section class="mb-8">
      <input
        data-testid="search-input"
        type="text"
        placeholder="Search by username..."
        (input)="onSearchInput($any($event.target).value)"
        class="w-full rounded-default border border-border-input px-3 py-2 text-sm text-text-heading
                 dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
        aria-label="Search users by username"
      />

      @if (friendService.searchResults().length > 0) {
        <ul
          class="mt-2 divide-y divide-border rounded-default border border-border
                     dark:divide-border-dark dark:border-border-dark"
        >
          @for (user of friendService.searchResults(); track user.userId) {
            <li class="flex items-center justify-between px-4 py-3">
              <div>
                <span class="text-sm font-medium text-text-heading dark:text-text-heading-dark">
                  {{ user.displayName }}
                </span>
                <span class="ml-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                  {{ user.username }}
                </span>
              </div>
              @if (isFriend(user.userId)) {
                <span class="text-xs text-text-secondary dark:text-text-secondary-dark"
                  >Friends</span
                >
              } @else if (hasPendingRequest(user.userId)) {
                <span class="text-xs text-text-secondary dark:text-text-secondary-dark"
                  >Request Sent</span
                >
              } @else if (hasIncomingRequest(user.userId)) {
                <span class="text-xs text-text-secondary dark:text-text-secondary-dark"
                  >Pending</span
                >
              } @else {
                <div class="flex gap-2">
                  <button
                    [attr.data-testid]="'add-friend-btn-' + user.userId"
                    (click)="addFriend(user.userId)"
                    [disabled]="actionInFlight()"
                    class="rounded-default bg-primary px-3 py-1 text-xs font-medium text-white
                             hover:bg-primary-hover disabled:opacity-disabled"
                  >
                    Add Friend
                  </button>
                  <button
                    [attr.data-testid]="'block-search-btn-' + user.userId"
                    (click)="blockUser(user.userId)"
                    [disabled]="actionInFlight()"
                    class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                             hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark
                             disabled:opacity-disabled"
                  >
                    Block
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }

      @if (searchError()) {
        <p class="mt-2 text-sm text-danger dark:text-danger-light">{{ searchError() }}</p>
      }
    </section>

    <!-- Incoming Requests -->
    <section class="mb-8">
      <h2
        data-testid="incoming-heading"
        class="mb-3 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
      >
        Incoming Requests ({{ friendService.incomingRequests().length }})
      </h2>
      @if (friendService.incomingRequests().length === 0) {
        <p
          data-testid="empty-incoming"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No incoming requests
        </p>
      } @else {
        <ul
          class="divide-y divide-border rounded-default border border-border
                     dark:divide-border-dark dark:border-border-dark"
        >
          @for (req of friendService.incomingRequests(); track req.requestId) {
            <li class="flex items-center justify-between px-4 py-3">
              <div>
                <span class="text-sm font-medium text-text-heading dark:text-text-heading-dark">
                  {{ req.user.displayName }}
                </span>
                <span class="ml-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                  {{ req.user.username }}
                </span>
              </div>
              <div class="flex gap-2">
                <button
                  [attr.data-testid]="'accept-btn-' + req.requestId"
                  (click)="accept(req.requestId)"
                  [disabled]="actionInFlight()"
                  class="rounded-default bg-success px-3 py-1 text-xs font-medium text-white
                           hover:bg-success-hover disabled:opacity-disabled"
                >
                  Accept
                </button>
                <button
                  [attr.data-testid]="'deny-btn-' + req.requestId"
                  (click)="deny(req.requestId)"
                  [disabled]="actionInFlight()"
                  class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                           hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark
                           disabled:opacity-disabled"
                >
                  Deny
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <!-- Outgoing Requests -->
    <section class="mb-8">
      <h2
        data-testid="outgoing-heading"
        class="mb-3 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
      >
        Outgoing Requests ({{ friendService.outgoingRequests().length }})
      </h2>
      @if (friendService.outgoingRequests().length === 0) {
        <p
          data-testid="empty-outgoing"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No outgoing requests
        </p>
      } @else {
        <ul
          class="divide-y divide-border rounded-default border border-border
                     dark:divide-border-dark dark:border-border-dark"
        >
          @for (req of friendService.outgoingRequests(); track req.requestId) {
            <li class="flex items-center justify-between px-4 py-3">
              <div>
                <span class="text-sm font-medium text-text-heading dark:text-text-heading-dark">
                  {{ req.user.displayName }}
                </span>
                <span class="ml-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                  {{ req.user.username }}
                </span>
              </div>
              <button
                [attr.data-testid]="'cancel-btn-' + req.requestId"
                (click)="cancel(req.requestId)"
                [disabled]="actionInFlight()"
                class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                         hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark
                         disabled:opacity-disabled"
              >
                Cancel
              </button>
            </li>
          }
        </ul>
      }
    </section>

    <!-- Friends List -->
    <section>
      <h2
        data-testid="friends-heading"
        class="mb-3 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
      >
        Friends ({{ friendService.friends().length }})
      </h2>
      @if (friendService.friends().length === 0) {
        <p
          data-testid="empty-friends"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No friends yet
        </p>
      } @else {
        <ul
          class="divide-y divide-border rounded-default border border-border
                     dark:divide-border-dark dark:border-border-dark"
        >
          @for (friend of friendService.friends(); track friend.friendshipId) {
            <li class="flex items-center justify-between px-4 py-3">
              <div>
                <span class="text-sm font-medium text-text-heading dark:text-text-heading-dark">
                  {{ friend.user.displayName }}
                </span>
                <span class="ml-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                  {{ friend.user.username }}
                </span>
              </div>
              @if (confirmingRemove() === friend.friendshipId) {
                <button
                  [attr.data-testid]="'confirm-remove-btn-' + friend.friendshipId"
                  (click)="confirmRemove(friend.friendshipId)"
                  [disabled]="actionInFlight()"
                  class="rounded-default bg-danger px-3 py-1 text-xs font-medium text-white
                           hover:bg-danger-hover disabled:opacity-disabled"
                >
                  Confirm?
                </button>
              } @else {
                <div class="flex gap-2">
                  <button
                    [attr.data-testid]="'remove-btn-' + friend.friendshipId"
                    (click)="startRemove(friend.friendshipId)"
                    class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                             hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                  >
                    Remove
                  </button>
                  <button
                    [attr.data-testid]="'block-friend-btn-' + friend.user.userId"
                    (click)="blockUser(friend.user.userId)"
                    [disabled]="actionInFlight()"
                    class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                             hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark
                             disabled:opacity-disabled"
                  >
                    Block
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>

    <!-- Blocked Users -->
    @if (blockService.blockedUsers().length > 0) {
      <section class="mt-8">
        <button
          data-testid="toggle-blocked"
          (click)="blockListExpanded.set(!blockListExpanded())"
          class="mb-3 flex items-center gap-1 text-lg font-semibold text-text-heading
                   dark:text-text-heading-dark"
          [attr.aria-expanded]="blockListExpanded()"
        >
          <span class="text-sm">{{ blockListExpanded() ? '▼' : '▶' }}</span>
          Blocked Users ({{ blockService.blockedUsers().length }})
        </button>
        @if (blockListExpanded()) {
          <ul
            class="divide-y divide-border rounded-default border border-border
                       dark:divide-border-dark dark:border-border-dark"
          >
            @for (blocked of blockService.blockedUsers(); track blocked.userId) {
              <li class="flex items-center justify-between px-4 py-3">
                <div>
                  <span class="text-sm font-medium text-text-heading dark:text-text-heading-dark">
                    {{ blocked.displayName }}
                  </span>
                  <span class="ml-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                    {{ blocked.username }}
                  </span>
                </div>
                @if (confirmingUnblock() === blocked.userId) {
                  <button
                    [attr.data-testid]="'confirm-unblock-btn-' + blocked.userId"
                    (click)="confirmUnblock(blocked.userId)"
                    [disabled]="actionInFlight()"
                    class="rounded-default bg-danger px-3 py-1 text-xs font-medium text-white
                             hover:bg-danger-hover disabled:opacity-disabled"
                  >
                    Confirm?
                  </button>
                } @else {
                  <button
                    [attr.data-testid]="'unblock-btn-' + blocked.userId"
                    (click)="startUnblock(blocked.userId)"
                    class="rounded-default px-3 py-1 text-xs font-medium text-text-secondary
                             hover:bg-surface-raised dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                  >
                    Unblock
                  </button>
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class FriendsPage implements OnInit {
  protected readonly blockService = inject(BlockService);
  protected readonly friendService = inject(FriendService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actionInFlight = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly confirmingRemove = signal<number | null>(null);
  protected readonly blockListExpanded = signal(false);
  protected readonly confirmingUnblock = signal<number | null>(null);

  private readonly searchSubject = new Subject<string>();
  private removeTimeout: ReturnType<typeof setTimeout> | null = null;
  private unblockTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.blockService.loadBlockedUsers();
    this.friendService.loadFriends();
    this.friendService.loadIncomingRequests();
    this.friendService.loadOutgoingRequests();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.friendService.searchUsers(query));
  }

  protected onSearchInput(value: string): void {
    this.searchError.set(null);
    this.searchSubject.next(value);
  }

  protected isFriend(userId: number): boolean {
    return this.friendService.friends().some((f) => f.user.userId === userId);
  }

  protected hasPendingRequest(userId: number): boolean {
    return this.friendService.outgoingRequests().some((r) => r.user.userId === userId);
  }

  protected hasIncomingRequest(userId: number): boolean {
    return this.friendService.incomingRequests().some((r) => r.user.userId === userId);
  }

  protected addFriend(userId: number): void {
    this.actionInFlight.set(true);
    this.searchError.set(null);
    this.friendService.sendRequest(userId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: (err) => {
        this.actionInFlight.set(false);
        if (err.status === 409) {
          this.searchError.set('Friend request already exists');
        } else if (err.status === 400) {
          this.searchError.set('Cannot send friend request to yourself');
        } else {
          this.searchError.set('Failed to send friend request');
        }
      },
    });
  }

  protected accept(requestId: number): void {
    this.actionInFlight.set(true);
    this.friendService.acceptRequest(requestId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected deny(requestId: number): void {
    this.actionInFlight.set(true);
    this.friendService.denyRequest(requestId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected cancel(requestId: number): void {
    this.actionInFlight.set(true);
    this.friendService.cancelRequest(requestId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected startRemove(friendshipId: number): void {
    if (this.removeTimeout) clearTimeout(this.removeTimeout);
    this.confirmingRemove.set(friendshipId);
    this.removeTimeout = setTimeout(() => this.confirmingRemove.set(null), 3000);
  }

  protected confirmRemove(friendshipId: number): void {
    if (this.removeTimeout) clearTimeout(this.removeTimeout);
    this.confirmingRemove.set(null);
    this.actionInFlight.set(true);
    this.friendService.removeFriend(friendshipId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected isBlockedUser(userId: number): boolean {
    return this.blockService.blockedUsers().some((b) => b.userId === userId);
  }

  protected blockUser(userId: number): void {
    this.actionInFlight.set(true);
    this.blockService.blockUser(userId).subscribe({
      next: () => {
        this.actionInFlight.set(false);
        this.friendService.searchUsers('');
      },
      error: () => this.actionInFlight.set(false),
    });
  }

  protected startUnblock(userId: number): void {
    if (this.unblockTimeout) clearTimeout(this.unblockTimeout);
    this.confirmingUnblock.set(userId);
    this.unblockTimeout = setTimeout(() => this.confirmingUnblock.set(null), 3000);
  }

  protected confirmUnblock(userId: number): void {
    if (this.unblockTimeout) clearTimeout(this.unblockTimeout);
    this.confirmingUnblock.set(null);
    this.actionInFlight.set(true);
    this.blockService.unblockUser(userId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }
}
