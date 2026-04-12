import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { WebSocketService } from '../websocket.service';
import { ThemeService } from './theme.service';
import { UserDropdown } from './user-dropdown';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, UserDropdown],
  selector: 'app-shell',
  template: `
    <header
      class="flex items-center justify-between border-b border-border bg-bg px-6 py-3 dark:border-border-dark dark:bg-bg-dark"
    >
      <a
        routerLink="/rooms"
        class="text-lg font-semibold text-text-heading hover:text-primary dark:text-text-heading-dark dark:hover:text-primary-light-text"
      >
        CardQuorum
      </a>

      <div class="flex items-center gap-4">
        <button
          (click)="theme.toggle()"
          class="rounded-default p-2 text-text-secondary hover:bg-surface-raised dark:text-text-body-dark dark:hover:bg-surface-dark"
          [attr.aria-label]="theme.darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          @if (theme.darkMode()) {
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clip-rule="evenodd"
              />
            </svg>
          } @else {
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
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

  ngOnInit(): void {
    this.ws.connect();
  }
}
