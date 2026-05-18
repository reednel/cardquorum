import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { WebSocketService } from '../websocket.service';
import { ThemeService } from './theme.service';
import { UserDropdown } from './user-dropdown';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, UserDropdown, FaIconComponent],
  selector: 'app-shell',
  template: `
    <header
      class="flex items-center justify-between border-b border-border bg-bg px-6 py-3 dark:border-border-dark dark:bg-bg-dark"
    >
      <nav class="flex items-center gap-6" aria-label="Main navigation">
        <a
          routerLink="/memberships"
          class="text-lg font-semibold text-text-heading hover:text-primary dark:text-text-heading-dark dark:hover:text-primary-dark"
        >
          CardQuorum
        </a>
        <a
          data-testid="nav-memberships"
          routerLink="/memberships"
          routerLinkActive="text-primary dark:text-primary-dark font-semibold"
          class="text-sm text-text-secondary hover:text-primary dark:text-text-secondary-dark dark:hover:text-primary-dark"
        >
          Memberships
        </a>
        <a
          data-testid="nav-discover"
          routerLink="/discover"
          routerLinkActive="text-primary dark:text-primary-dark font-semibold"
          class="text-sm text-text-secondary hover:text-primary dark:text-text-secondary-dark dark:hover:text-primary-dark"
        >
          Discover
        </a>
        <a
          data-testid="nav-replay"
          routerLink="/replay"
          routerLinkActive="text-primary dark:text-primary-dark font-semibold"
          class="text-sm text-text-secondary hover:text-primary dark:text-text-secondary-dark dark:hover:text-primary-dark"
        >
          Replay
        </a>
      </nav>

      <div class="flex items-center gap-4">
        <button
          (click)="theme.toggle()"
          class="rounded-default p-2 text-text-secondary hover:bg-hover-overlay dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
          [attr.aria-label]="theme.darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          @if (theme.darkMode()) {
            <fa-icon
              [icon]="faSun"
              class="flex h-5 w-5 items-center justify-center"
              aria-hidden="true"
            />
          } @else {
            <fa-icon
              [icon]="faMoon"
              class="flex h-5 w-5 items-center justify-center"
              aria-hidden="true"
            />
          }
        </button>

        <app-user-dropdown />
      </div>
    </header>

    <main style="height: calc(100vh - 3rem)">
      <router-outlet />
    </main>
  `,
  host: { class: 'block h-full overflow-auto bg-bg dark:bg-bg-dark' },
})
export class AppShell implements OnInit {
  protected readonly theme = inject(ThemeService);
  private readonly ws = inject(WebSocketService);
  protected readonly faSun = faSun;
  protected readonly faMoon = faMoon;

  ngOnInit(): void {
    this.ws.connect();
  }
}
