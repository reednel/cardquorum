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

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-view',
  imports: [FormsModule, ChatMemberList, ChatMessageList],
  template: `
    <div class="flex h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <!-- Sidebar -->
      <aside
        class="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50
               dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="border-b border-gray-200 p-4 dark:border-gray-700">
          <h1
            class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Room
          </h1>
          <p class="mt-1 truncate text-sm text-gray-900 dark:text-white" [title]="roomName()">
            {{ roomName() }}
          </p>
        </div>
        <app-chat-member-list [members]="chatService.members()" class="flex-1 overflow-y-auto" />
        <div class="border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            (click)="leave()"
            class="w-full rounded-md bg-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors
                   hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500
                   dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Leave Room
          </button>
        </div>
      </aside>

      <!-- Main chat area -->
      <main class="flex min-w-0 flex-1 flex-col">
        <app-chat-message-list [messages]="chatService.messages()" class="flex-1 overflow-y-auto" />

        <form
          (ngSubmit)="send()"
          class="flex shrink-0 gap-2 border-t border-gray-200 p-4 dark:border-gray-700"
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
                   focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500
                   dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <button
            type="submit"
            [disabled]="!messageText()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                   transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed
                   disabled:bg-gray-400 disabled:text-gray-200
                   focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Send
          </button>
        </form>
      </main>
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
