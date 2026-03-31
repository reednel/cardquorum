import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  RoomBanResponse,
  RoomInviteResponse,
  RoomResponse,
  UserSearchResult,
} from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { RoomService } from './room.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-members-tab',
  template: `
    <div id="members-panel" role="tabpanel" aria-label="Members" class="flex-1 overflow-y-auto p-4">
      <!-- Active Members -->
      <h3
        class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500
               dark:text-gray-400"
      >
        Online ({{ chatService.members().length }})
      </h3>
      <ul class="mb-4 flex flex-col gap-1">
        @for (member of chatService.members(); track member.userId) {
          <li
            class="flex items-center justify-between text-sm text-gray-700
                   dark:text-gray-300"
          >
            <span class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-green-500" aria-hidden="true"></span>
              {{ member.displayName ?? member.username }}
            </span>
            @if (isOwner() && member.userId !== room().ownerId) {
              <button
                (click)="onBan(member.userId)"
                class="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50
                       dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Ban
              </button>
            }
          </li>
        }
      </ul>

      <!-- Invited (not online) — visible to everyone for invite-only rooms -->
      @if (room().visibility === 'invite-only' && offlineInvitees().length > 0) {
        <h3
          class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500
                 dark:text-gray-400"
        >
          Invited ({{ offlineInvitees().length }})
        </h3>
        <ul class="mb-4 flex flex-col gap-1">
          @for (inv of offlineInvitees(); track inv.userId) {
            <li
              class="flex items-center justify-between text-sm text-gray-500
                     dark:text-gray-400"
            >
              <span class="flex items-center gap-2">
                <span
                  class="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600"
                  aria-hidden="true"
                ></span>
                {{ inv.displayName ?? inv.username }}
              </span>
              @if (isOwner()) {
                <button
                  (click)="onUninvite(inv.userId)"
                  class="rounded px-1.5 py-0.5 text-xs text-amber-600
                         hover:bg-amber-50 dark:text-amber-400
                         dark:hover:bg-amber-900/20"
                >
                  Revoke
                </button>
              }
            </li>
          }
        </ul>
      }

      <!-- Invite search — owner of invite-only room -->
      @if (isOwner() && room().visibility === 'invite-only') {
        <div class="mb-4">
          <label
            for="invite-member-search"
            class="mb-1 block text-sm font-semibold uppercase tracking-wide
                   text-gray-500 dark:text-gray-400"
          >
            Invite User
          </label>
          <input
            id="invite-member-search"
            type="text"
            autocomplete="off"
            placeholder="Search by username..."
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                   focus:border-indigo-500 focus:outline-none focus:ring-1
                   focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                   dark:text-gray-100"
            (input)="onInviteSearch($event)"
          />
          @if (inviteSearchResults().length > 0) {
            <ul
              class="mt-1 max-h-32 overflow-y-auto rounded-md border border-gray-200
                     bg-white dark:border-gray-700 dark:bg-gray-800"
              role="listbox"
              aria-label="User search results"
            >
              @for (user of inviteSearchResults(); track user.userId) {
                <li>
                  <button
                    type="button"
                    role="option"
                    [attr.aria-selected]="false"
                    class="w-full px-3 py-1.5 text-left text-sm text-gray-700
                           hover:bg-gray-100 dark:text-gray-300
                           dark:hover:bg-gray-700"
                    (click)="onInviteFromSearch(user)"
                  >
                    {{ user.displayName ?? user.username }}
                    @if (user.displayName) {
                      <span class="text-gray-400">({{ user.username }})</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }

      <!-- Banned — owner only -->
      @if (isOwner() && bans().length > 0) {
        <h3
          class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500
                 dark:text-gray-400"
        >
          Banned ({{ bans().length }})
        </h3>
        <ul class="flex flex-col gap-1">
          @for (ban of bans(); track ban.userId) {
            <li
              class="flex items-center justify-between text-sm text-gray-500
                     dark:text-gray-400"
            >
              <span>{{ ban.displayName ?? ban.username }}</span>
              <button
                (click)="onUnban(ban.userId)"
                class="rounded px-1.5 py-0.5 text-xs text-green-600 hover:bg-green-50
                       dark:text-green-400 dark:hover:bg-green-900/20"
              >
                Unban
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class RoomMembersTab {
  readonly room = input.required<RoomResponse>();

  readonly chatService = inject(ChatService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly roomService = inject(RoomService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invites = signal<RoomInviteResponse[]>([]);
  protected readonly bans = signal<RoomBanResponse[]>([]);
  protected readonly inviteSearchResults = signal<UserSearchResult[]>([]);

  protected readonly isOwner = computed(() => this.room().ownerId === this.auth.user()?.userId);

  protected readonly offlineInvitees = computed(() => {
    const onlineIds = new Set(this.chatService.members().map((m) => m.userId));
    return this.invites().filter((inv) => !onlineIds.has(inv.userId));
  });

  loadData(): void {
    if (this.isOwner()) {
      this.loadInvites();
      this.loadBans();
    } else if (this.room().visibility === 'invite-only') {
      this.loadInvites();
    }
  }

  protected onBan(userId: number): void {
    this.roomService.banUser(this.room().id, userId).subscribe(() => {
      this.loadInvites();
      this.loadBans();
    });
  }

  protected onUninvite(userId: number): void {
    this.roomService.uninviteUser(this.room().id, userId).subscribe(() => this.loadInvites());
  }

  protected onUnban(userId: number): void {
    this.roomService.unbanUser(this.room().id, userId).subscribe(() => this.loadBans());
  }

  protected onInviteSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value.trim();
    if (!query) {
      this.inviteSearchResults.set([]);
      return;
    }
    const invitedIds = new Set(this.invites().map((i) => i.userId));
    const memberIds = new Set(this.chatService.members().map((m) => m.userId));
    this.http.get<UserSearchResult[]>('/api/users/search', { params: { q: query } }).subscribe({
      next: (results) => {
        this.inviteSearchResults.set(
          results.filter((r) => !invitedIds.has(r.userId) && !memberIds.has(r.userId)),
        );
      },
    });
  }

  protected onInviteFromSearch(user: UserSearchResult): void {
    this.roomService.inviteUser(this.room().id, user.userId).subscribe(() => {
      this.inviteSearchResults.set([]);
      this.loadInvites();
    });
  }

  private loadInvites(): void {
    this.roomService
      .getInvites(this.room().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (invites) => this.invites.set(invites) });
  }

  private loadBans(): void {
    this.roomService
      .getBans(this.room().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (bans) => this.bans.set(bans) });
  }
}
