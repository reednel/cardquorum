import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-account-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="mx-auto max-w-xl px-4 py-8">
      <nav
        class="mb-6 flex border-b border-gray-200 dark:border-gray-700"
        aria-label="Account sections"
      >
        <a
          routerLink="/account"
          [routerLinkActiveOptions]="{ exact: true }"
          routerLinkActive="!border-indigo-600 !text-indigo-600 dark:!border-indigo-400 dark:!text-indigo-400"
          class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500
                 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Account
        </a>
        <a
          routerLink="/account/friends"
          routerLinkActive="!border-indigo-600 !text-indigo-600 dark:!border-indigo-400 dark:!text-indigo-400"
          class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500
                 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Friends
        </a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class AccountShell {}
