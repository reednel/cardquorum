import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageList } from '../chat/chat-message-list';
import { ChatService } from '../chat/chat.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-chat-tab',
  imports: [FormsModule, ChatMessageList],
  template: `
    <div id="chat-panel" role="tabpanel" aria-label="Chat" class="flex min-h-0 flex-1 flex-col">
      <app-chat-message-list [messages]="chatService.messages()" class="flex-1 overflow-y-auto" />
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
  `,
})
export class RoomChatTab {
  readonly chatService = inject(ChatService);
  protected readonly messageText = signal('');

  protected send(): void {
    const text = this.messageText().trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.messageText.set('');
  }
}
