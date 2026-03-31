import { TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
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
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { RoomChatTab } from './room-chat-tab';
import { RoomGameTab } from './room-game-tab';
import { RoomMembersTab } from './room-members-tab';
import { RoomService } from './room.service';

type RoomTab = 'chat' | 'members' | 'game';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-view',
  imports: [TitleCasePipe, RoomChatTab, RoomMembersTab, RoomGameTab],
  template: `
    <div class="flex h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <!-- Game area (reserved) -->
      <main class="flex-1"></main>

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
          <button
            (click)="leave()"
            class="shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors
                   hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2
                   focus:ring-indigo-500 dark:text-gray-400 dark:hover:bg-gray-700
                   dark:hover:text-gray-200"
          >
            Leave
          </button>
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
          @switch (activeTab()) {
            @case ('chat') {
              <app-room-chat-tab />
            }
            @case ('members') {
              @if (room(); as r) {
                <app-room-members-tab [room]="r" />
              }
            }
            @case ('game') {
              <app-room-game-tab />
            }
          }
        </div>
      </aside>
    </div>
  `,
  host: { class: 'block h-full' },
})
export class RoomView implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly roomService = inject(RoomService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);

  private readonly membersTab = viewChild(RoomMembersTab);

  protected readonly tabs: RoomTab[] = ['chat', 'members', 'game'];
  protected readonly activeTab = signal<RoomTab>('chat');
  protected readonly roomName = signal('');
  protected readonly room = signal<RoomResponse | null>(null);
  private roomId = 0;

  constructor() {
    effect(() => {
      const deletedId = this.chatService.roomDeleted();
      if (deletedId !== null && deletedId === this.roomId) {
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
    this.router.navigate(['/rooms']);
  }
}
