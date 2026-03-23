import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { FriendService } from './friend.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-friends-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-xl px-4 py-8">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Friends</h1>
        <a
          routerLink="/account"
          class="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Back to Account
        </a>
      </div>

      <!-- Search -->
      <section class="mb-8">
        <input
          data-testid="search-input"
          type="text"
          placeholder="Search by username..."
          (input)="onSearchInput($any($event.target).value)"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900
                 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label="Search users by username"
        />

        @if (friendService.searchResults().length > 0) {
          <ul
            class="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200
                     dark:divide-gray-700 dark:border-gray-700"
          >
            @for (user of friendService.searchResults(); track user.userId) {
              <li class="flex items-center justify-between px-4 py-3">
                <div>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {{ user.displayName }}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ user.username }}
                  </span>
                </div>
                @if (isFriend(user.userId)) {
                  <span class="text-xs text-gray-500 dark:text-gray-400">Friends</span>
                } @else if (hasPendingRequest(user.userId)) {
                  <span class="text-xs text-gray-500 dark:text-gray-400">Request Sent</span>
                } @else if (hasIncomingRequest(user.userId)) {
                  <span class="text-xs text-gray-500 dark:text-gray-400">Pending</span>
                } @else {
                  <button
                    [attr.data-testid]="'add-friend-btn-' + user.userId"
                    (click)="addFriend(user.userId)"
                    [disabled]="actionInFlight()"
                    class="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white
                           hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add Friend
                  </button>
                }
              </li>
            }
          </ul>
        }

        @if (searchError()) {
          <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ searchError() }}</p>
        }
      </section>

      <!-- Incoming Requests -->
      <section class="mb-8">
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Incoming Requests ({{ friendService.incomingRequests().length }})
        </h2>
        @if (friendService.incomingRequests().length === 0) {
          <p class="text-sm text-gray-500 dark:text-gray-400">No incoming requests</p>
        } @else {
          <ul
            class="divide-y divide-gray-100 rounded-md border border-gray-200
                     dark:divide-gray-700 dark:border-gray-700"
          >
            @for (req of friendService.incomingRequests(); track req.friendshipId) {
              <li class="flex items-center justify-between px-4 py-3">
                <div>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {{ req.user.displayName }}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ req.user.username }}
                  </span>
                </div>
                <div class="flex gap-2">
                  <button
                    [attr.data-testid]="'accept-btn-' + req.friendshipId"
                    (click)="accept(req.friendshipId)"
                    [disabled]="actionInFlight()"
                    class="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white
                           hover:bg-green-700 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    [attr.data-testid]="'deny-btn-' + req.friendshipId"
                    (click)="deny(req.friendshipId)"
                    [disabled]="actionInFlight()"
                    class="rounded-md px-3 py-1 text-xs font-medium text-gray-600
                           hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800
                           disabled:opacity-50"
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
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Outgoing Requests ({{ friendService.outgoingRequests().length }})
        </h2>
        @if (friendService.outgoingRequests().length === 0) {
          <p class="text-sm text-gray-500 dark:text-gray-400">No outgoing requests</p>
        } @else {
          <ul
            class="divide-y divide-gray-100 rounded-md border border-gray-200
                     dark:divide-gray-700 dark:border-gray-700"
          >
            @for (req of friendService.outgoingRequests(); track req.friendshipId) {
              <li class="flex items-center justify-between px-4 py-3">
                <div>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {{ req.user.displayName }}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ req.user.username }}
                  </span>
                </div>
                <button
                  [attr.data-testid]="'cancel-btn-' + req.friendshipId"
                  (click)="cancel(req.friendshipId)"
                  [disabled]="actionInFlight()"
                  class="rounded-md px-3 py-1 text-xs font-medium text-gray-600
                         hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800
                         disabled:opacity-50"
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
        <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Friends ({{ friendService.friends().length }})
        </h2>
        @if (friendService.friends().length === 0) {
          <p class="text-sm text-gray-500 dark:text-gray-400">No friends yet</p>
        } @else {
          <ul
            class="divide-y divide-gray-100 rounded-md border border-gray-200
                     dark:divide-gray-700 dark:border-gray-700"
          >
            @for (friend of friendService.friends(); track friend.friendshipId) {
              <li class="flex items-center justify-between px-4 py-3">
                <div>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {{ friend.user.displayName }}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ friend.user.username }}
                  </span>
                </div>
                @if (confirmingRemove() === friend.friendshipId) {
                  <button
                    [attr.data-testid]="'confirm-remove-btn-' + friend.friendshipId"
                    (click)="confirmRemove(friend.friendshipId)"
                    [disabled]="actionInFlight()"
                    class="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white
                           hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm?
                  </button>
                } @else {
                  <button
                    [attr.data-testid]="'remove-btn-' + friend.friendshipId"
                    (click)="startRemove(friend.friendshipId)"
                    class="rounded-md px-3 py-1 text-xs font-medium text-gray-600
                           hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Remove
                  </button>
                }
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class FriendsPage implements OnInit {
  protected readonly friendService = inject(FriendService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actionInFlight = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly confirmingRemove = signal<number | null>(null);

  private readonly searchSubject = new Subject<string>();
  private removeTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
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

  protected accept(friendshipId: number): void {
    this.actionInFlight.set(true);
    this.friendService.acceptRequest(friendshipId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected deny(friendshipId: number): void {
    this.actionInFlight.set(true);
    this.friendService.denyRequest(friendshipId).subscribe({
      next: () => this.actionInFlight.set(false),
      error: () => this.actionInFlight.set(false),
    });
  }

  protected cancel(friendshipId: number): void {
    this.actionInFlight.set(true);
    this.friendService.cancelRequest(friendshipId).subscribe({
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
}
