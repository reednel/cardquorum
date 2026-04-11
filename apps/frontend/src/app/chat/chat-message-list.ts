import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatMessagePayload } from '@cardquorum/shared';
import { FormatTimePipe } from './format-time.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-message-list',
  imports: [FormatTimePipe],
  host: { role: 'log', 'aria-live': 'polite' },
  template: `
    <div class="flex h-full flex-col gap-2 overflow-y-auto p-4">
      @for (msg of messages(); track msg.id) {
        <div class="text-sm">
          <p class="wrap-break-word text-text-body dark:text-text-body-dark">{{ msg.content }}</p>
          <div class="flex items-center gap-2 text-xs">
            <span class="font-semibold text-primary dark:text-primary-light-text">
              {{ msg.senderDisplayName }}
            </span>
            <span class="text-text-secondary">{{ msg.sentAt | formatTime }}</span>
          </div>
        </div>
      } @empty {
        <p class="py-8 text-center text-sm text-text-secondary">No messages yet. Say hello!</p>
      }
    </div>
  `,
})
export class ChatMessageList {
  messages = input.required<ChatMessagePayload[]>();
}
