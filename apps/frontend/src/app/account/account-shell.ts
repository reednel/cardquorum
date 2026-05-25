import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faChartBar,
  faFileLines,
  faUserGear,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-account-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FaIconComponent],
  template: `
    <div class="mx-auto max-w-xl px-4 py-8">
      <nav
        class="mb-6 flex border-b border-border dark:border-border-dark"
        aria-label="Account sections"
      >
        <a
          routerLink="/user/account"
          [routerLinkActiveOptions]="{ exact: true }"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-dark dark:!text-primary-dark"
          class="flex-1 inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          <fa-icon [icon]="faUserGear" class="text-xs" aria-hidden="true" />
          Account
        </a>
        <a
          routerLink="/user/friends"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-dark dark:!text-primary-dark"
          class="flex-1 inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          <fa-icon [icon]="faUserGroup" class="text-xs" aria-hidden="true" />
          Friends
        </a>
        <a
          routerLink="/user/stats"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-dark dark:!text-primary-dark"
          class="flex-1 inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          <fa-icon [icon]="faChartBar" class="text-xs" aria-hidden="true" />
          Stats
        </a>
        <a
          routerLink="/user/reports"
          routerLinkActive="!border-primary !text-primary dark:!border-primary-dark dark:!text-primary-dark"
          class="flex-1 inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary
                 hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark"
        >
          <fa-icon [icon]="faFileLines" class="text-xs" aria-hidden="true" />
          Reports
        </a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class AccountShell {
  protected readonly faUserGear = faUserGear;
  protected readonly faUserGroup = faUserGroup;
  protected readonly faChartBar = faChartBar;
  protected readonly faFileLines = faFileLines;
}
