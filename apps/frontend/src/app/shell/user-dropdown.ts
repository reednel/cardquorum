import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faChartBar,
  faFileLines,
  faRightFromBracket,
  faUserGear,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../auth/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-user-dropdown',
  imports: [FaIconComponent],
  template: `
    <div class="relative">
      <button
        data-testid="user-menu-trigger"
        (click)="toggleMenu()"
        class="rounded-default px-3 py-1.5 text-sm text-text-body hover:bg-hover-overlay
               dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
        [attr.aria-expanded]="showMenu()"
        aria-haspopup="true"
        aria-label="User menu"
      >
        {{ auth.user()?.displayName ?? auth.user()?.username }}
      </button>

      @if (showMenu()) {
        <div
          data-testid="user-menu"
          role="menu"
          class="absolute right-0 z-10 mt-1 w-40 rounded-default border border-border bg-bg
                 py-1 shadow-lg dark:border-border-dark dark:bg-surface-dark"
        >
          <button
            data-testid="menu-account"
            role="menuitem"
            (click)="goToAccount()"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-body hover:bg-hover-overlay
                   dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
          >
            <fa-icon [icon]="faUserGear" class="text-xs" aria-hidden="true" />
            Account
          </button>
          <button
            data-testid="menu-friends"
            role="menuitem"
            (click)="goToFriends()"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-body hover:bg-hover-overlay
                   dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
          >
            <fa-icon [icon]="faUserGroup" class="text-xs" aria-hidden="true" />
            Friends
          </button>
          <button
            data-testid="menu-stats"
            role="menuitem"
            (click)="goToStats()"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-body hover:bg-hover-overlay
                   dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
          >
            <fa-icon [icon]="faChartBar" class="text-xs" aria-hidden="true" />
            Stats
          </button>
          <button
            data-testid="menu-reports"
            role="menuitem"
            (click)="goToReports()"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-body hover:bg-hover-overlay
                   dark:text-text-body-dark dark:hover:bg-hover-overlay-dark"
          >
            <fa-icon [icon]="faFileLines" class="text-xs" aria-hidden="true" />
            Reports
          </button>
          <div class="border-t border-border dark:border-border-dark my-1"></div>
          <button
            data-testid="menu-logout"
            role="menuitem"
            (click)="doLogout()"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-danger-surface
                   dark:text-danger-dark dark:hover:bg-danger-surface-dark"
          >
            <fa-icon [icon]="faRightFromBracket" class="text-xs" aria-hidden="true" />
            Log out
          </button>
        </div>
      }
    </div>
  `,
})
export class UserDropdown implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elRef = inject(ElementRef);

  protected readonly faUserGear = faUserGear;
  protected readonly faUserGroup = faUserGroup;
  protected readonly faChartBar = faChartBar;
  protected readonly faFileLines = faFileLines;
  protected readonly faRightFromBracket = faRightFromBracket;

  protected readonly showMenu = signal(false);

  ngOnInit(): void {
    const onDocClick = (e: MouseEvent) => {
      if (this.showMenu() && !this.elRef.nativeElement.contains(e.target as Node)) {
        this.showMenu.set(false);
      }
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.showMenu.set(false);
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeydown);
    });
  }

  protected toggleMenu(): void {
    this.showMenu.update((v) => !v);
  }

  protected goToAccount(): void {
    this.showMenu.set(false);
    this.router.navigate(['/user/account']);
  }

  protected goToStats(): void {
    this.showMenu.set(false);
    this.router.navigate(['/user/stats']);
  }

  protected goToReports(): void {
    this.showMenu.set(false);
    this.router.navigate(['/user/reports']);
  }

  protected goToFriends(): void {
    this.showMenu.set(false);
    this.router.navigate(['/user/friends']);
  }

  protected doLogout(): void {
    this.showMenu.set(false);
    this.auth.logout();
  }
}
