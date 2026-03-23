import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { UserService } from './user.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-account-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-xl px-4 py-8">
      <h1 class="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Account</h1>

      @if (!userService.profile()) {
        <p class="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      } @else {
        <dl class="space-y-4">
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Username</dt>
            <dd class="mt-1 text-gray-900 dark:text-gray-100">
              {{ userService.profile()!.username }}
            </dd>
          </div>

          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Display Name</dt>
            <dd class="mt-1">
              @if (editing()) {
                <div class="flex items-center gap-2">
                  <input
                    data-testid="display-name-input"
                    type="text"
                    [value]="editValue()"
                    (input)="editValue.set($any($event.target).value)"
                    maxlength="50"
                    class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900
                           dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    aria-label="Display name"
                  />
                  <button
                    data-testid="save-display-name-btn"
                    (click)="save()"
                    [disabled]="saving()"
                    class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white
                           hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    data-testid="cancel-edit-btn"
                    (click)="cancelEdit()"
                    class="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100
                           dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
                @if (errorMessage()) {
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
                }
              } @else {
                <span class="text-gray-900 dark:text-gray-100">
                  {{ userService.profile()!.displayName }}
                </span>
                <button
                  data-testid="edit-display-name-btn"
                  (click)="startEdit()"
                  class="ml-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Edit
                </button>
              }
            </dd>
          </div>

          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
            <dd class="mt-1 text-gray-900 dark:text-gray-100">
              {{ userService.profile()!.email ?? 'Not set' }}
            </dd>
          </div>

          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Member Since</dt>
            <dd class="mt-1 text-gray-900 dark:text-gray-100">
              {{ formatDate(userService.profile()!.createdAt) }}
            </dd>
          </div>
        </dl>

        <div class="mt-8">
          <a
            data-testid="friends-link"
            routerLink="/account/friends"
            class="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Manage Friends
          </a>
        </div>
      }
    </div>
  `,
})
export class AccountPage implements OnInit {
  protected readonly userService = inject(UserService);

  protected readonly editing = signal(false);
  protected readonly editValue = signal('');
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.userService.loadProfile();
  }

  protected startEdit(): void {
    this.editValue.set(this.userService.profile()?.displayName ?? '');
    this.errorMessage.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.errorMessage.set(null);
  }

  protected save(): void {
    const trimmed = this.editValue().trim();
    if (!trimmed || trimmed.length > 50) {
      this.errorMessage.set('Display name must be 1-50 characters');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    this.userService
      .updateDisplayName(trimmed)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => this.editing.set(false),
        error: () => this.errorMessage.set('Failed to update display name'),
      });
  }

  protected formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  }
}
