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
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faArrowRotateRight,
  faArrowsRotate,
  faBan,
  faCrown,
  faGripVertical,
  faRotate,
  faUserCheck,
  faUserXmark,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import {
  hueToHsl,
  RoomBanResponse,
  RoomInviteResponse,
  RoomResponse,
  RosterMember,
  RotationMode,
  UserSearchResult,
  WS_EVENT,
} from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { GameService } from '../game/game.service';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ThemeService } from '../shell/theme.service';
import { WebSocketService } from '../websocket.service';
import { OverflowAction, OverflowMenuComponent } from './overflow-menu';
import { RoomContextService } from './room-context.service';
import { RoomService } from './room.service';
import {
  computeInvitedList,
  computeStatus,
  formatRosterCount,
  RosterService,
} from './roster.service';

const ROTATION_MODES: { icon: typeof faBan; tooltip: string; value: RotationMode }[] = [
  { icon: faBan, tooltip: 'No seat rotation', value: 'none' },
  {
    icon: faArrowRotateRight,
    tooltip: 'Rotate players by one seat each game',
    value: 'rotate-players',
  },
  {
    icon: faArrowsRotate,
    tooltip: 'Rotate one readied spectator into play each game',
    value: 'rotate-spectators',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-members-tab',
  imports: [CdkDropList, CdkDrag, OverflowMenuComponent, FaIconComponent, ConfirmDialog],
  template: `
    <div id="members-panel" role="tabpanel" aria-label="Members" class="flex-1 overflow-y-auto p-4">
      <!-- Players section header with rotation mode control -->
      <div class="mb-2 flex items-center justify-between">
        <h3
          class="text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
          data-testid="players-section"
        >
          Players ({{ rosterService.players().length }})
        </h3>
        @if (isOwner()) {
          <div
            role="radiogroup"
            aria-label="Rotation mode"
            class="flex overflow-hidden rounded border border-border dark:border-border-dark"
            data-testid="rotation-mode-group"
          >
            @for (opt of rotationModes; track opt.value) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="rosterService.rotationMode() === opt.value"
                [attr.aria-label]="opt.tooltip"
                [title]="opt.tooltip"
                (click)="onSetRotationMode(opt.value)"
                [attr.data-testid]="'rotation-mode-' + opt.value"
                [class]="
                  'px-2 py-0.5 text-xs transition-colors ' +
                  (rosterService.rotationMode() === opt.value
                    ? 'bg-primary text-white dark:bg-primary-light-text dark:text-bg-dark'
                    : 'text-text-secondary hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-body-dark')
                "
              >
                <fa-icon [icon]="opt.icon" aria-hidden="true" />
              </button>
            }
          </div>
        }
      </div>
      <ul
        cdkDropList
        #playersList="cdkDropList"
        [cdkDropListData]="rosterService.players()"
        [cdkDropListConnectedTo]="[spectatorsList]"
        [cdkDropListDisabled]="!dragEnabled()"
        (cdkDropListDropped)="onDrop($event)"
        data-testid="players-list"
        class="mb-4 flex min-h-8 flex-col gap-0.5"
      >
        @for (member of rosterService.players(); track member.userId) {
          <li
            cdkDrag
            [cdkDragData]="member"
            [class]="
              'group flex items-center justify-between rounded px-1 py-1 text-sm text-text-body dark:text-text-body-dark' +
              (dragEnabled()
                ? ' cursor-grab hover:bg-surface-raised dark:hover:bg-surface-raised-dark'
                : '')
            "
          >
            <span class="flex items-center gap-2">
              @if (dragEnabled()) {
                <fa-icon
                  [icon]="faGripVertical"
                  class="shrink-0 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 dark:text-text-secondary-dark"
                  aria-hidden="true"
                />
              }
              <span class="relative shrink-0">
                @if (member.userId === auth.user()?.userId) {
                  <button
                    type="button"
                    [attr.aria-label]="
                      member.readyToPlay ? 'Set not ready to play' : 'Set ready to play'
                    "
                    class="cursor-pointer hover:opacity-80"
                    (click)="onToggleReady()"
                    data-testid="toggle-ready-btn"
                  >
                    <fa-icon
                      [icon]="member.readyToPlay ? faUserCheck : faUserXmark"
                      class="text-sm"
                      [style.color]="memberIconColor(member)"
                      [attr.data-testid]="'ready-icon-' + member.userId"
                    />
                  </button>
                } @else {
                  <span>
                    <fa-icon
                      [icon]="member.readyToPlay ? faUserCheck : faUserXmark"
                      class="text-sm"
                      [style.color]="memberIconColor(member)"
                      [attr.data-testid]="'ready-icon-' + member.userId"
                    />
                  </span>
                }
                <span
                  [class]="
                    'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white dark:border-bg-dark ' +
                    statusDotClass(member.userId)
                  "
                  [title]="statusTooltip(member.userId)"
                  [attr.aria-label]="statusTooltip(member.userId)"
                  role="img"
                  [attr.data-testid]="'status-dot-' + member.userId"
                ></span>
              </span>
              {{ member.displayName ?? member.username }}
              @if (member.userId === room().ownerId) {
                <fa-icon
                  [icon]="faCrown"
                  class="text-xs text-amber-500"
                  aria-hidden="true"
                  [attr.data-testid]="'crown-icon-' + member.userId"
                />
              }
            </span>
            @if (isOwner() && member.userId !== room().ownerId && !gameService.sessionId()) {
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
        class="mb-4 flex min-h-8 flex-col gap-0.5"
      >
        @for (member of rosterService.spectators(); track member.userId) {
          <li
            cdkDrag
            [cdkDragData]="member"
            [cdkDragDisabled]="!member.readyToPlay || !dragEnabled()"
            [class]="
              'group flex items-center justify-between rounded px-1 py-1 text-sm text-text-body dark:text-text-body-dark' +
              (dragEnabled() && member.readyToPlay
                ? ' cursor-grab hover:bg-surface-raised dark:hover:bg-surface-raised-dark'
                : '')
            "
            [attr.data-testid]="!member.readyToPlay ? 'drag-disabled-' + member.userId : null"
          >
            <span class="flex items-center gap-2">
              @if (dragEnabled() && member.readyToPlay) {
                <fa-icon
                  [icon]="faGripVertical"
                  class="shrink-0 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 dark:text-text-secondary-dark"
                  aria-hidden="true"
                />
              }
              <span class="relative shrink-0">
                @if (member.userId === auth.user()?.userId) {
                  <button
                    type="button"
                    [attr.aria-label]="
                      member.readyToPlay ? 'Set not ready to play' : 'Set ready to play'
                    "
                    class="cursor-pointer hover:opacity-80"
                    (click)="onToggleReady()"
                    data-testid="toggle-ready-btn"
                  >
                    <fa-icon
                      [icon]="member.readyToPlay ? faUserCheck : faUserXmark"
                      class="text-sm"
                      [style.color]="memberIconColor(member)"
                      [attr.data-testid]="'ready-icon-' + member.userId"
                    />
                  </button>
                } @else {
                  <span>
                    <fa-icon
                      [icon]="member.readyToPlay ? faUserCheck : faUserXmark"
                      class="text-sm"
                      [style.color]="memberIconColor(member)"
                      [attr.data-testid]="'ready-icon-' + member.userId"
                    />
                  </span>
                }
                <span
                  [class]="
                    'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white dark:border-bg-dark ' +
                    statusDotClass(member.userId)
                  "
                  [title]="statusTooltip(member.userId)"
                  [attr.aria-label]="statusTooltip(member.userId)"
                  role="img"
                  [attr.data-testid]="'status-dot-' + member.userId"
                ></span>
              </span>
              {{ member.displayName ?? member.username }}
              @if (member.userId === room().ownerId) {
                <fa-icon
                  [icon]="faCrown"
                  class="text-xs text-amber-500"
                  aria-hidden="true"
                  [attr.data-testid]="'crown-icon-' + member.userId"
                />
              }
            </span>
            @if (isOwner() && member.userId !== room().ownerId) {
              <app-overflow-menu [actions]="rosterMemberActions(member.userId)" />
            }
          </li>
          @if (member.userId === auth.user()?.userId && showReadyPrompt()) {
            <div
              class="ml-6 mt-1 mb-1 flex items-center gap-2 rounded bg-surface-raised px-3 py-2 text-xs text-text-secondary dark:bg-surface-raised-dark dark:text-text-secondary-dark"
              data-testid="ready-prompt"
            >
              <span>Toggle ready to become eligible for games</span>
              <button
                type="button"
                aria-label="Dismiss ready prompt"
                class="ml-auto shrink-0 cursor-pointer hover:opacity-80"
                (click)="dismissReadyPrompt()"
                data-testid="ready-prompt-dismiss"
              >
                <fa-icon [icon]="faXmark" class="text-xs" />
              </button>
            </div>
          }
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
        <ul class="mb-4 flex flex-col gap-0.5">
          @for (inv of invitedList(); track inv.userId) {
            <li
              class="flex items-center justify-between rounded px-1 py-1 text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              <span class="flex items-center gap-2">
                <span class="relative shrink-0">
                  <fa-icon [icon]="faUserXmark" class="text-sm text-disabled" aria-hidden="true" />
                  <span
                    class="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-border-input dark:border-bg-dark dark:bg-border-input-dark"
                    title="Not in room"
                    aria-label="Not in room"
                    role="img"
                    [attr.data-testid]="'status-dot-' + inv.userId"
                  ></span>
                </span>
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

    @if (showAbandonButton()) {
      <div class="shrink-0 border-t border-border px-4 py-3 dark:border-border-dark">
        <button
          type="button"
          class="w-full rounded-default border border-danger px-3 py-2 text-sm font-medium
                 text-danger hover:bg-danger-surface
                 dark:border-danger-light dark:text-danger-light dark:hover:bg-danger-surface-dark"
          (click)="confirmingAbandon.set(true)"
          data-testid="abandon-game-btn"
        >
          Abandon Game
        </button>
      </div>
    }

    @if (confirmingAbandon()) {
      <app-confirm-dialog
        title="Abandon Game"
        message="This will forefit the current game to your opponents."
        confirmLabel="Abandon"
        titleId="abandon-dialog-title"
        (confirmed)="onConfirmAbandon()"
        (closed)="confirmingAbandon.set(false)"
      />
    }
  `,
})
export class RoomMembersTab {
  readonly room = input.required<RoomResponse>();

  protected readonly rosterService = inject(RosterService);
  private readonly roomContext = inject(RoomContextService);
  protected readonly gameService = inject(GameService);
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  private readonly roomService = inject(RoomService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly themeService = inject(ThemeService);
  private readonly ws = inject(WebSocketService);

  protected readonly invites = signal<RoomInviteResponse[]>([]);
  protected readonly bans = signal<RoomBanResponse[]>([]);
  protected readonly inviteSearchResults = signal<UserSearchResult[]>([]);
  protected readonly showReadyPrompt = signal(false);
  protected readonly confirmingAbandon = signal(false);
  private readyPromptDismissed = false;

  protected readonly isOwner = computed(() => this.room().ownerId === this.auth.user()?.userId);

  protected readonly onlineUserIds = computed(
    () => new Set(this.roomContext.members().map((m) => m.userId)),
  );

  protected readonly invitedList = computed(() =>
    computeInvitedList(this.invites(), {
      players: this.rosterService.players(),
      spectators: this.rosterService.spectators(),
      rotationMode: this.rosterService.rotationMode(),
    }),
  );

  protected readonly rosterCount = computed(() =>
    formatRosterCount(
      this.rosterService.players().length + this.rosterService.spectators().length,
      this.room().memberLimit,
    ),
  );

  protected readonly dragEnabled = computed(() => this.isOwner() && !this.gameService.sessionId());

  /** Show abandon button when there's an active game and the current user is a player */
  protected readonly showAbandonButton = computed(() => {
    const sessionId = this.gameService.sessionId();
    if (sessionId === null) return false;
    const userId = this.auth.user()?.userId;
    if (userId == null) return false;
    return this.rosterService.players().some((m) => m.userId === userId);
  });

  protected readonly rotationModes = ROTATION_MODES;
  protected readonly faBan = faBan;
  protected readonly faArrowRotateRight = faArrowRotateRight;
  protected readonly faArrowsRotate = faArrowsRotate;
  protected readonly faRotate = faRotate;
  protected readonly faGripVertical = faGripVertical;
  protected readonly faCrown = faCrown;
  protected readonly faUserCheck = faUserCheck;
  protected readonly faUserXmark = faUserXmark;
  protected readonly faXmark = faXmark;

  constructor() {
    // Watch for ready prompt: show when current user is a non-ready spectator
    effect(() => {
      if (this.readyPromptDismissed) return;
      const userId = this.auth.user()?.userId;
      if (userId == null) {
        this.showReadyPrompt.set(false);
        return;
      }
      const spectator = this.rosterService.spectators().find((m) => m.userId === userId);
      if (spectator && !spectator.readyToPlay) {
        this.showReadyPrompt.set(true);
      } else {
        // Auto-dismiss when user toggles ready or is no longer a non-ready spectator
        this.showReadyPrompt.set(false);
      }
    });
  }

  loadData(): void {
    if (this.isOwner()) {
      this.loadInvites();
      this.loadBans();
    } else if (this.room().visibility === 'invite-only') {
      this.loadInvites();
    }
  }

  protected memberIconColor(member: RosterMember): string {
    if (member.assignedHue === null) {
      return this.themeService.darkMode() ? '#a3a3a3' : '#737373';
    }
    return hueToHsl(member.assignedHue, this.themeService.darkMode() ? 'dark' : 'light');
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
      { label: 'Ban', variant: 'danger', handler: () => this.onBan(userId) },
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

  protected onToggleReady(): void {
    this.rosterService.toggleReady(this.room().id);
  }

  protected onSetRotationMode(mode: RotationMode): void {
    this.rosterService.setRotationMode(this.room().id, mode);
  }

  protected onToggleRotate(): void {
    const enabled = this.rosterService.rotationMode() === 'none';
    this.rosterService.toggleRotate(this.room().id, enabled).subscribe();
  }

  protected onConfirmAbandon(): void {
    this.confirmingAbandon.set(false);
    const sessionId = this.gameService.sessionId();
    if (sessionId !== null) {
      this.ws.send(WS_EVENT.GAME_ABANDON, { sessionId });
    }
  }

  protected dismissReadyPrompt(): void {
    this.readyPromptDismissed = true;
    this.showReadyPrompt.set(false);
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
