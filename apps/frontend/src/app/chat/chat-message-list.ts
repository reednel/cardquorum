import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatMessagePayload } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-message-list',
  host: { role: 'log', 'aria-live': 'polite' },
  template: `
    <div class="flex flex-col gap-1 p-4 overflow-y-auto h-full">
      @for (msg of messages(); track msg.id) {
        <div class="flex gap-2 text-sm">
          <span class="font-semibold text-indigo-400 shrink-0">{{ msg.senderNickname }}</span>
          <span class="text-gray-200 wrap-break-word min-w-0">{{ msg.content }}</span>
          <span class="text-gray-500 text-xs shrink-0 ml-auto self-end">
            {{ formatTime(msg.sentAt) }}
          </span>
        </div>
      } @empty {
        <p class="text-gray-500 text-sm text-center py-8">No messages yet. Say hello!</p>
      }
    </div>
  `,
})
export class ChatMessageList {
  messages = input.required<ChatMessagePayload[]>();

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
