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
        class="flex shrink-0 gap-2 border-t border-border p-3 dark:border-border-dark"
      >
        <label class="sr-only" for="message-input">Message</label>
        <input
          id="message-input"
          type="text"
          [(ngModel)]="messageText"
          name="message"
          autocomplete="off"
          placeholder="Type a message..."
          class="flex-1 rounded-default border border-border-input bg-bg px-3 py-2 text-sm
                 dark:border-border-input-dark dark:bg-surface-dark
                 dark:text-white"
        />
        <button
          type="submit"
          [disabled]="!messageText()"
          class="rounded-default bg-primary px-3 py-2 text-sm font-semibold text-white
                 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed
                 disabled:bg-disabled disabled:text-disabled-text"
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
