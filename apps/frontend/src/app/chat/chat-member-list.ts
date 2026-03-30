import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UserIdentity } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-member-list',
  template: `
    <div class="p-4">
      <h2
        class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Members ({{ members().length }})
      </h2>
      <ul class="flex flex-col gap-1">
        @for (member of members(); track member.userId) {
          <li class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span class="h-2 w-2 rounded-full bg-green-500" aria-hidden="true"></span>
            {{ member.displayName ?? member.username }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class ChatMemberList {
  members = input.required<UserIdentity[]>();
}
