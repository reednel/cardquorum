import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../services/chat.service';
import { ChatMemberList } from './chat-member-list';
import { ChatMessageList } from './chat-message-list';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-room',
  imports: [FormsModule, ChatMessageList, ChatMemberList],
  template: `
    <div class="flex h-screen bg-gray-900 text-white">
      <!-- Sidebar -->
      <aside class="w-56 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
        <div class="p-4 border-b border-gray-700">
          <h1 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Room</h1>
          <p class="text-white text-sm truncate mt-1" [title]="roomId">{{ roomId }}</p>
        </div>
        <app-chat-member-list [members]="chatService.members()" class="flex-1 overflow-y-auto" />
        <div class="p-4 border-t border-gray-700">
          <button
            (click)="leave()"
            class="w-full rounded-md bg-gray-700 px-3 py-2 text-sm text-gray-300
                   hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2
                   focus:ring-indigo-500"
          >
            Leave Room
          </button>
        </div>
      </aside>

      <!-- Main chat area -->
      <main class="flex-1 flex flex-col min-w-0">
        <app-chat-message-list [messages]="chatService.messages()" class="flex-1 overflow-y-auto" />

        <form (ngSubmit)="send()" class="p-4 border-t border-gray-700 flex gap-2 shrink-0">
          <label class="sr-only" for="message-input">Message</label>
          <input
            id="message-input"
            type="text"
            [(ngModel)]="messageText"
            name="message"
            autocomplete="off"
            placeholder="Type a message…"
            class="flex-1 rounded-md bg-gray-800 border border-gray-600 text-white px-3 py-2
                   text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                   focus:border-transparent"
          />
          <button
            type="submit"
            [disabled]="!messageText()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                   hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  `,
})
export class ChatRoom implements OnInit, OnDestroy {
  readonly chatService = inject(ChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  roomId = 0;
  messageText = signal('');

  ngOnInit(): void {
    const param = this.route.snapshot.paramMap.get('roomId');
    this.roomId = param ? parseInt(param, 10) : 0;
    const displayName = sessionStorage.getItem('chat_display_name');

    if (!this.roomId || !displayName) {
      this.router.navigate(['/chat']);
      return;
    }

    this.chatService.connect();
    this.chatService.joinRoom(this.roomId, displayName);
  }

  ngOnDestroy(): void {
    this.chatService.leaveRoom();
    this.chatService.disconnect();
  }

  send(): void {
    const text = this.messageText().trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.messageText.set('');
  }

  leave(): void {
    this.router.navigate(['/chat']);
  }
}
