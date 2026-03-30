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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatMemberList } from '../chat/chat-member-list';
import { ChatMessageList } from '../chat/chat-message-list';
import { ChatService } from '../chat/chat.service';
import { RoomService } from './room.service';

type RoomTab = 'chat' | 'members' | 'settings';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-view',
  imports: [FormsModule, TitleCasePipe, ChatMemberList, ChatMessageList],
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
              (click)="activeTab.set(tab)"
            >
              {{ tab | titlecase }}
            </button>
          }
        </nav>

        <!-- Tab panels -->
        <div class="flex min-h-0 flex-1 flex-col">
          @switch (activeTab()) {
            @case ('chat') {
              <div
                id="chat-panel"
                role="tabpanel"
                aria-label="Chat"
                class="flex min-h-0 flex-1 flex-col"
              >
                <app-chat-message-list
                  [messages]="chatService.messages()"
                  class="flex-1 overflow-y-auto"
                />
                <form
                  (ngSubmit)="send()"
                  class="flex shrink-0 gap-2 border-t border-gray-200 p-3 dark:border-gray-700"
                >
                  <label class="sr-only" for="message-input">Message</label>
                  <input
                    id="message-input"
                    type="text"
                    [(ngModel)]="messageText"
                    name="message"
                    autocomplete="off"
                    placeholder="Type a message..."
                    class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                           focus:border-transparent focus:outline-none focus:ring-2
                           focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                           dark:text-white"
                  />
                  <button
                    type="submit"
                    [disabled]="!messageText()"
                    class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white
                           transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed
                           disabled:bg-gray-400 disabled:text-gray-200 focus:outline-none
                           focus:ring-2 focus:ring-indigo-500"
                  >
                    Send
                  </button>
                </form>
              </div>
            }
            @case ('members') {
              <div
                id="members-panel"
                role="tabpanel"
                aria-label="Members"
                class="flex-1 overflow-y-auto"
              >
                <app-chat-member-list [members]="chatService.members()" />
              </div>
            }
            @case ('settings') {
              <div
                id="settings-panel"
                role="tabpanel"
                aria-label="Settings"
                class="flex-1 overflow-y-auto p-4"
              >
                <p class="text-sm text-gray-500 dark:text-gray-400">No settings available.</p>
              </div>
            }
          }
        </div>
      </aside>
    </div>
  `,
  host: { class: 'block h-full' },
})
export class RoomView implements OnInit, OnDestroy {
  readonly chatService = inject(ChatService);
  private readonly roomService = inject(RoomService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);

  protected readonly tabs: RoomTab[] = ['chat', 'members', 'settings'];
  protected readonly activeTab = signal<RoomTab>('chat');
  protected readonly roomName = signal('');
  protected readonly messageText = signal('');
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

  protected send(): void {
    const text = this.messageText().trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.messageText.set('');
  }

  protected leave(): void {
    this.router.navigate(['/rooms']);
  }
}
