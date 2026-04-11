import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UserIdentity } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-member-list',
  template: `
    <div class="p-4">
      <h2
        class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
      >
        Members ({{ members().length }})
      </h2>
      <ul class="flex flex-col gap-1">
        @for (member of members(); track member.userId) {
          <li class="flex items-center gap-2 text-sm text-text-body dark:text-text-body-dark">
            <span class="h-2 w-2 rounded-full bg-success-dot" aria-hidden="true"></span>
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
