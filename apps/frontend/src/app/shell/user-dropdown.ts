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
import { AuthService } from '../auth/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-user-dropdown',
  template: `
    <div class="relative">
      <button
        data-testid="user-menu-trigger"
        (click)="toggleMenu()"
        class="rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100
               dark:text-gray-300 dark:hover:bg-gray-800"
        [attr.aria-expanded]="showMenu()"
        aria-haspopup="true"
      >
        {{ auth.user()?.displayName }}
      </button>

      @if (showMenu()) {
        <div
          data-testid="user-menu"
          role="menu"
          class="absolute right-0 z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white
                 py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            data-testid="menu-account"
            role="menuitem"
            (click)="goToAccount()"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100
                   dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Account
          </button>
          <button
            data-testid="menu-logout"
            role="menuitem"
            (click)="doLogout()"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100
                   dark:text-gray-300 dark:hover:bg-gray-800"
          >
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
    this.router.navigate(['/account']);
  }

  protected doLogout(): void {
    this.showMenu.set(false);
    this.auth.logout();
  }
}
