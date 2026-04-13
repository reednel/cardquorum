import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
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
  RosterMember,
  UserSearchResult,
} from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { GameService } from '../game/game.service';
import { OverflowAction, OverflowMenuComponent } from './overflow-menu';
import { RoomContextService } from './room-context.service';
import { RoomService } from './room.service';
import {
  computeInvitedList,
  computeStatus,
  formatRosterCount,
  RosterService,
} from './roster.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-members-tab',
  imports: [CdkDropList, CdkDrag, OverflowMenuComponent],
  template: `
    <div id="members-panel" role="tabpanel" aria-label="Members" class="flex-1 overflow-y-auto p-4">
      <!-- Roster count -->
      <p
        class="mb-3 text-sm font-medium text-text-body dark:text-text-body-dark"
        data-testid="roster-count"
      >
        Members: {{ rosterCount() }}
      </p>

      <!-- Rotate Players toggle (owner only) -->
      @if (isOwner()) {
        <label
          class="mb-3 flex items-center gap-2 text-sm text-text-body dark:text-text-body-dark"
          data-testid="rotate-toggle"
        >
          <input
            type="checkbox"
            [checked]="rosterService.rotatePlayers()"
            (change)="onToggleRotate($event)"
            class="h-4 w-4 rounded border-border-input text-primary"
          />
          Rotate Players
        </label>
      }

      <!-- Players section -->
      <h3
        class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
        data-testid="players-section"
      >
        Players ({{ rosterService.players().length }})
      </h3>
      <ul
        cdkDropList
        #playersList="cdkDropList"
        [cdkDropListData]="rosterService.players()"
        [cdkDropListConnectedTo]="[spectatorsList]"
        [cdkDropListDisabled]="!dragEnabled()"
        (cdkDropListDropped)="onDrop($event)"
        data-testid="players-list"
        class="mb-4 flex min-h-8 flex-col gap-1"
      >
        @for (member of rosterService.players(); track member.userId) {
          <li
            cdkDrag
            [cdkDragData]="member"
            class="flex items-center justify-between rounded px-1 py-0.5 text-sm text-text-body dark:text-text-body-dark"
          >
            <span class="flex items-center gap-2">
              <span
                [class]="
                  'inline-block h-2 w-2 shrink-0 rounded-full ' + statusDotClass(member.userId)
                "
                [title]="statusTooltip(member.userId)"
                [attr.aria-label]="statusTooltip(member.userId)"
                role="img"
                [attr.data-testid]="'status-dot-' + member.userId"
              ></span>
              {{ member.displayName ?? member.username }}
            </span>
            @if (isOwner() && member.userId !== room().ownerId) {
              <app-overflow-menu [actions]="rosterMemberActions(member.userId)" />
            }
          </li>
        }
      </ul>

      <!-- Spectators section -->
      <h3
        class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
        data-testid="spectators-section"
      >
        Spectators ({{ rosterService.spectators().length }})
      </h3>
      <ul
        cdkDropList
        #spectatorsList="cdkDropList"
        [cdkDropListData]="rosterService.spectators()"
        [cdkDropListConnectedTo]="[playersList]"
        [cdkDropListDisabled]="!dragEnabled()"
        (cdkDropListDropped)="onDrop($event)"
        data-testid="spectators-list"
        class="mb-4 flex min-h-8 flex-col gap-1"
      >
        @for (member of rosterService.spectators(); track member.userId) {
          <li
            cdkDrag
            [cdkDragData]="member"
            class="flex items-center justify-between rounded px-1 py-0.5 text-sm text-text-body dark:text-text-body-dark"
          >
            <span class="flex items-center gap-2">
              <span
                [class]="
                  'inline-block h-2 w-2 shrink-0 rounded-full ' + statusDotClass(member.userId)
                "
                [title]="statusTooltip(member.userId)"
                [attr.aria-label]="statusTooltip(member.userId)"
                role="img"
                [attr.data-testid]="'status-dot-' + member.userId"
              ></span>
              {{ member.displayName ?? member.username }}
            </span>
            @if (isOwner() && member.userId !== room().ownerId) {
              <app-overflow-menu [actions]="rosterMemberActions(member.userId)" />
            }
          </li>
        }
      </ul>

      <!-- Invited section (invite-only rooms only) -->
      @if (room().visibility === 'invite-only' && invitedList().length > 0) {
        <h3
          class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
          data-testid="invited-section"
        >
          Invited ({{ invitedList().length }})
        </h3>
        <ul class="mb-4 flex flex-col gap-1">
          @for (inv of invitedList(); track inv.userId) {
            <li
              class="flex items-center justify-between text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              <span class="flex items-center gap-2">
                <span
                  class="inline-block h-2 w-2 shrink-0 rounded-full bg-border-input dark:bg-border-input-dark"
                  title="Not in room"
                  aria-label="Not in room"
                  role="img"
                  [attr.data-testid]="'status-dot-' + inv.userId"
                ></span>
                {{ inv.displayName ?? inv.username }}
              </span>
              @if (isOwner()) {
                <app-overflow-menu [actions]="invitedMemberActions(inv.userId)" />
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
            class="mb-1 block text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
          >
            Invite User
          </label>
          <input
            id="invite-member-search"
            type="text"
            autocomplete="off"
            placeholder="Search by username..."
            class="w-full rounded-default border border-border-input px-3 py-2 text-sm
                   dark:border-border-input-dark dark:bg-surface-dark
                   dark:text-text-heading-dark"
            (input)="onInviteSearch($event)"
          />
          @if (inviteSearchResults().length > 0) {
            <ul
              class="mt-1 max-h-32 overflow-y-auto rounded-default border border-border
                     bg-bg dark:border-border-dark dark:bg-surface-dark"
              role="listbox"
              aria-label="User search results"
            >
              @for (user of inviteSearchResults(); track user.userId) {
                <li>
                  <button
                    type="button"
                    role="option"
                    [attr.aria-selected]="false"
                    class="w-full px-3 py-1.5 text-left text-sm text-text-body
                           hover:bg-surface-raised dark:text-text-body-dark
                           dark:hover:bg-surface-raised-dark"
                    (click)="onInviteFromSearch(user)"
                  >
                    {{ user.displayName ?? user.username }}
                    @if (user.displayName) {
                      <span class="text-text-secondary">({{ user.username }})</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }

      <!-- Banned section — owner only -->
      @if (isOwner() && bans().length > 0) {
        <h3
          class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
          data-testid="banned-section"
        >
          Banned ({{ bans().length }})
        </h3>
        <ul class="flex flex-col gap-1">
          @for (ban of bans(); track ban.userId) {
            <li
              class="flex items-center justify-between text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              <span>{{ ban.displayName ?? ban.username }}</span>
              <button
                (click)="onUnban(ban.userId)"
                class="rounded px-1.5 py-0.5 text-xs text-success hover:bg-success-surface
                       dark:text-success-light dark:hover:bg-success-surface-dark"
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

  protected readonly rosterService = inject(RosterService);
  private readonly roomContext = inject(RoomContextService);
  private readonly gameService = inject(GameService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly roomService = inject(RoomService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly invites = signal<RoomInviteResponse[]>([]);
  protected readonly bans = signal<RoomBanResponse[]>([]);
  protected readonly inviteSearchResults = signal<UserSearchResult[]>([]);

  protected readonly isOwner = computed(() => this.room().ownerId === this.auth.user()?.userId);

  protected readonly onlineUserIds = computed(
    () => new Set(this.roomContext.members().map((m) => m.userId)),
  );

  protected readonly invitedList = computed(() =>
    computeInvitedList(this.invites(), {
      players: this.rosterService.players(),
      spectators: this.rosterService.spectators(),
      rotatePlayers: this.rosterService.rotatePlayers(),
    }),
  );

  protected readonly rosterCount = computed(() =>
    formatRosterCount(
      this.rosterService.players().length + this.rosterService.spectators().length,
      this.room().memberLimit,
    ),
  );

  protected readonly dragEnabled = computed(() => this.isOwner() && !this.gameService.sessionId());

  loadData(): void {
    if (this.isOwner()) {
      this.loadInvites();
      this.loadBans();
    } else if (this.room().visibility === 'invite-only') {
      this.loadInvites();
    }
  }

  protected statusDotClass(userId: number): string {
    const status = computeStatus(userId, this.onlineUserIds());
    return status === 'online' ? 'bg-success' : 'bg-border-input dark:bg-border-input-dark';
  }

  protected statusTooltip(userId: number): string {
    return computeStatus(userId, this.onlineUserIds()) === 'online' ? 'In room' : 'Not in room';
  }

  protected rosterMemberActions(userId: number): OverflowAction[] {
    return [
      { label: 'Kick', handler: () => this.onKick(userId) },
      { label: 'Ban', handler: () => this.onBan(userId) },
    ];
  }

  protected invitedMemberActions(userId: number): OverflowAction[] {
    return [{ label: 'Revoke', handler: () => this.onUninvite(userId) }];
  }

  protected onDrop(event: CdkDragDrop<RosterMember[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }

    const playerIds = this.rosterService.players().map((m) => m.userId);
    const spectatorIds = this.rosterService.spectators().map((m) => m.userId);
    this.rosterService.reorderRoster(this.room().id, playerIds, spectatorIds).subscribe();
  }

  protected onToggleRotate(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.rosterService.toggleRotate(this.room().id, enabled).subscribe();
  }

  protected onKick(userId: number): void {
    this.rosterService.kickUser(this.room().id, userId).subscribe(() => {
      this.loadInvites();
    });
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
    const memberIds = new Set(this.roomContext.members().map((m) => m.userId));
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
