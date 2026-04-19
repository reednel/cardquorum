import { TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomResponse, WS_EVENT } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { GameTable } from '../game/game-table';
import { GameService } from '../game/game.service';
import { WebSocketService } from '../websocket.service';
import { RoomChatTab } from './room-chat-tab';
import { RoomContextService } from './room-context.service';
import { RoomGameTab } from './room-game-tab';
import { RoomMembersTab } from './room-members-tab';
import { RoomService } from './room.service';
import { RosterService } from './roster.service';

type RoomTab = 'chat' | 'members' | 'game';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-view',
  imports: [TitleCasePipe, RoomChatTab, RoomMembersTab, RoomGameTab, GameTable],
  template: `
    <div class="flex h-full bg-bg text-text-heading dark:bg-bg-dark dark:text-white">
      <!-- Game area -->
      <main class="flex-1">
        @if (gameService.state()) {
          <app-game-table
            [myUserID]="myUserID()"
            [members]="roomContext.members()"
            [isOwner]="isOwner()"
            [autostart]="roomGameTab()?.autostart() ?? false"
            (startNextGame)="onStartNextGame()"
          />
        }
      </main>

      <!-- Expand button (visible when panel is collapsed) -->
      @if (!panelOpen()) {
        <button
          data-testid="expand-panel-btn"
          (click)="panelOpen.set(true)"
          aria-label="Open side panel"
          class="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-md border border-r-0
                 border-border bg-surface px-1 py-3 text-text-secondary shadow-md
                 transition-colors hover:bg-surface-raised hover:text-text-body
                 dark:border-border-dark dark:bg-surface-dark
                 dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark
                 dark:hover:text-text-heading-dark"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      }

      <!-- Right panel -->
      @if (panelOpen()) {
        <aside
          class="flex w-80 shrink-0 flex-col border-l border-border bg-surface
                 dark:border-border-dark dark:bg-surface-dark"
        >
          <!-- Room header -->
          <div
            class="flex items-center justify-between border-b border-border px-4 py-3
                   dark:border-border-dark"
          >
            <div class="flex min-w-0 items-center gap-1">
              <button
                data-testid="collapse-panel-btn"
                (click)="panelOpen.set(false)"
                aria-label="Collapse side panel"
                class="shrink-0 rounded-default p-1 text-text-secondary transition-colors
                       hover:bg-surface-raised hover:text-text-body
                       dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark
                       dark:hover:text-text-heading-dark"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <p
                class="truncate text-sm font-semibold text-text-heading dark:text-white"
                [title]="roomName()"
              >
                {{ roomName() }}
              </p>
            </div>
            @if (!isOwner()) {
              <button
                data-testid="leave-btn"
                (click)="leave()"
                class="shrink-0 rounded-default px-2 py-1 text-xs text-text-secondary transition-colors
                       hover:bg-surface-raised hover:text-text-body
                       dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark
                       dark:hover:text-text-heading-dark"
              >
                Leave
              </button>
            }
          </div>

          <!-- Tabs -->
          <nav
            class="flex border-b border-border dark:border-border-dark"
            role="tablist"
            aria-label="Room panels"
          >
            @for (tab of tabs; track tab) {
              <button
                role="tab"
                [attr.aria-selected]="activeTab() === tab"
                [attr.aria-controls]="tab + '-panel'"
                [class]="
                  'flex-1 px-3 py-2 text-sm font-medium transition-colors ' +
                  (activeTab() === tab
                    ? 'border-b-2 border-primary-light text-primary dark:text-primary-light-text'
                    : 'text-text-secondary hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark')
                "
                (click)="onTabClick(tab)"
              >
                {{ tab | titlecase }}
              </button>
            }
          </nav>

          <!-- Tab panels -->
          <div class="flex min-h-0 flex-1 flex-col">
            <app-room-chat-tab
              [class.hidden]="activeTab() !== 'chat'"
              class="flex min-h-0 flex-1 flex-col"
            />
            @if (room(); as r) {
              <app-room-members-tab
                [room]="r"
                [hidden]="activeTab() !== 'members'"
                class="flex min-h-0 flex-1 flex-col"
              />
            }
            <app-room-game-tab
              [isOwner]="isOwner()"
              [rosterPlayers]="rosterService.players()"
              [hidden]="activeTab() !== 'game'"
              class="flex min-h-0 flex-1 flex-col"
            />
          </div>
        </aside>
      }
    </div>
  `,
  host: {
    class: 'relative block overflow-hidden',
    style: 'height: calc(100% + 3rem)',
  },
})
export class RoomView implements OnInit, OnDestroy {
  protected readonly chatService = inject(ChatService);
  protected readonly roomContext = inject(RoomContextService);
  protected readonly gameService = inject(GameService);
  protected readonly rosterService = inject(RosterService);
  private readonly roomService = inject(RoomService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly ws = inject(WebSocketService);

  private readonly membersTab = viewChild(RoomMembersTab);
  protected readonly roomGameTab = viewChild(RoomGameTab);

  protected readonly myUserID = computed(() => this.auth.user()?.userId ?? 0);
  protected readonly tabs: RoomTab[] = ['chat', 'members', 'game'];
  protected readonly activeTab = signal<RoomTab>('chat');
  protected readonly panelOpen = signal(true);
  protected readonly roomName = signal('');
  protected readonly room = signal<RoomResponse | null>(null);
  protected readonly isOwner = signal(false);
  private roomId = 0;

  constructor() {
    effect(() => {
      const deletedId = this.roomContext.roomDeleted();
      if (deletedId !== null && deletedId === this.roomId) {
        this.router.navigate(['/rooms']);
      }
    });
    effect(() => {
      const err = this.roomContext.joinError();
      if (err !== null) {
        this.router.navigate(['/rooms']);
      }
    });

    // Auto-start a game created via the fallback path in onStartNextGame
    effect(() => {
      const sessionId = this.gameService.sessionId();
      if (this.pendingAutoStart && sessionId !== null) {
        this.pendingAutoStart = false;
        this.gameService.startGame(sessionId);
      }
    });
  }

  ngOnInit(): void {
    const param = this.route.snapshot.paramMap.get('roomId');
    this.roomId = param ? parseInt(param, 10) : 0;

    if (!this.roomId) {
      this.router.navigate(['/rooms']);
      return;
    }

    this.roomService
      .getRoom(this.roomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (room) => {
          this.room.set(room);
          this.roomName.set(room.name);
          this.title.setTitle(`${room.name} — CardQuorum`);
          this.isOwner.set(room.ownerId === this.auth.user()?.userId);
        },
        error: () => this.router.navigate(['/rooms']),
      });

    this.roomContext.joinRoom(this.roomId);
    this.gameService.rejoinGame(this.roomId);
  }

  ngOnDestroy(): void {
    this.roomContext.leaveRoom();
    this.chatService.clearMessages();
    this.gameService.leaveRoom();
  }

  protected onTabClick(tab: RoomTab): void {
    this.activeTab.set(tab);
    if (tab === 'members') {
      this.membersTab()?.loadData();
    }
  }

  protected leave(): void {
    this.ws.send(WS_EVENT.ROOM_LEAVE_ROSTER, { roomId: this.roomId });
    this.router.navigate(['/rooms']);
  }

  private pendingAutoStart = false;

  protected onStartNextGame(): void {
    // Try the game tab first (has full config state and pendingStart flow)
    const tab = this.roomGameTab();
    if (tab) {
      tab.onStart();
      return;
    }
    // Fallback: create game directly using the last known game type and config
    const gameType = this.gameService.gameType();
    const config = this.gameService.config();
    if (this.roomId && gameType) {
      this.pendingAutoStart = true;
      this.gameService.createGame(this.roomId, gameType, config);
    }
  }
}
