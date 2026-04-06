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
    <div class="flex h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <!-- Game area -->
      <main class="flex-1">
        @if (gameService.state()) {
          <app-game-table [myUserID]="myUserID()" [members]="chatService.members()" />
        }
      </main>

      <!-- Right panel -->
      <aside
        class="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-gray-50
               dark:border-gray-700 dark:bg-gray-800"
      >
        <!-- Room header -->
        <div
          class="flex items-center justify-between border-b border-gray-200 px-4 py-3
                 dark:border-gray-700"
        >
          <p
            class="truncate text-sm font-semibold text-gray-900 dark:text-white"
            [title]="roomName()"
          >
            {{ roomName() }}
          </p>
          @if (!isOwner()) {
            <button
              data-testid="leave-btn"
              (click)="leave()"
              class="shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors
                     hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2
                     focus:ring-indigo-500 dark:text-gray-400 dark:hover:bg-gray-700
                     dark:hover:text-gray-200"
            >
              Leave
            </button>
          }
        </div>

        <!-- Tabs -->
        <nav
          class="flex border-b border-gray-200 dark:border-gray-700"
          role="tablist"
          aria-label="Room panels"
        >
          @for (tab of tabs; track tab) {
            <button
              role="tab"
              [attr.aria-selected]="activeTab() === tab"
              [attr.aria-controls]="tab + '-panel'"
              [class]="
                'flex-1 px-3 py-2 text-sm font-medium transition-colors focus:outline-none ' +
                'focus:ring-2 focus:ring-inset focus:ring-indigo-500 ' +
                (activeTab() === tab
                  ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200')
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
    </div>
  `,
  host: { class: 'block h-full' },
})
export class RoomView implements OnInit, OnDestroy {
  protected readonly chatService = inject(ChatService);
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

  protected readonly myUserID = computed(() => this.auth.user()?.userId ?? 0);
  protected readonly tabs: RoomTab[] = ['chat', 'members', 'game'];
  protected readonly activeTab = signal<RoomTab>('chat');
  protected readonly roomName = signal('');
  protected readonly room = signal<RoomResponse | null>(null);
  protected readonly isOwner = signal(false);
  private roomId = 0;

  constructor() {
    effect(() => {
      const deletedId = this.chatService.roomDeleted();
      if (deletedId !== null && deletedId === this.roomId) {
        this.router.navigate(['/rooms']);
      }
    });
    effect(() => {
      const err = this.chatService.joinError();
      if (err !== null) {
        this.router.navigate(['/rooms']);
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

    this.chatService.joinRoom(this.roomId);
  }

  ngOnDestroy(): void {
    this.chatService.leaveRoom();
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
}
