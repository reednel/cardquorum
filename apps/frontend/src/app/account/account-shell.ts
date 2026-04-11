import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-account-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="mx-auto max-w-xl px-4 py-8">
      <nav
        class="mb-6 flex border-b border-border dark:border-border-dark"
        aria-label="Account sections"
      >
        <a
          routerLink="/account"
          [routerLinkActiveOptions]="{ exact: true }"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-light-text dark:!text-primary-light-text"
          class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          Account
        </a>
        <a
          routerLink="/account/friends"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-light-text dark:!text-primary-light-text"
          class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          Friends
        </a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class AccountShell {}
