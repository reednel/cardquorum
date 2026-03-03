import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UserIdentity } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-member-list',
  template: `
    <div class="p-4">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Members ({{ members().length }})
      </h2>
      <ul class="flex flex-col gap-1">
        @for (member of members(); track member.userId) {
          <li class="text-sm text-gray-300 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500" aria-hidden="true"></span>
            {{ member.nickname }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class ChatMemberList {
  members = input.required<UserIdentity[]>();
}
