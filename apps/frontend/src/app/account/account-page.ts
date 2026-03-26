import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../auth/auth.service';
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

        <div
          class="mt-8 border-t border-gray-200 pt-8 dark:border-gray-700"
          data-testid="linked-accounts"
        >
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Linked Accounts</h2>

          @if (successMessage()) {
            <p class="mt-2 text-sm text-green-600 dark:text-green-400">{{ successMessage() }}</p>
          }
          @if (credentialError()) {
            <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ credentialError() }}</p>
          }

          <div class="mt-4 space-y-4">
            <!-- Password credential -->
            @if (strategies().includes('basic') || hasBasic()) {
              <div
                class="flex items-center justify-between rounded-md border border-gray-200
                        px-4 py-3 dark:border-gray-700"
              >
                <div>
                  <span class="font-medium text-gray-900 dark:text-gray-100">Password</span>
                  @if (hasBasic()) {
                    <span class="ml-2 text-sm text-green-600 dark:text-green-400">Linked</span>
                  }
                </div>
                @if (hasBasic() && canRemoveBasic()) {
                  @if (confirmingUnlinkBasic()) {
                    <div class="flex items-center gap-2">
                      <input
                        data-testid="unlink-basic-password"
                        type="password"
                        [value]="unlinkPassword()"
                        (input)="unlinkPassword.set($any($event.target).value)"
                        placeholder="Enter password"
                        class="rounded-md border border-gray-300 px-2 py-1 text-sm
                             dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        aria-label="Password to confirm removal"
                      />
                      <button
                        data-testid="confirm-unlink-basic-btn"
                        (click)="confirmUnlinkBasic()"
                        [disabled]="unlinkingBasic()"
                        class="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white
                             hover:bg-red-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        data-testid="cancel-unlink-basic-btn"
                        (click)="cancelUnlinkBasic()"
                        class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  } @else {
                    <button
                      data-testid="unlink-basic-btn"
                      (click)="startUnlinkBasic()"
                      class="text-sm text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  }
                }
              </div>
              @if (unlinkBasicError()) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ unlinkBasicError() }}</p>
              }

              @if (canAddBasic()) {
                <div class="rounded-md border border-gray-200 px-4 py-3 dark:border-gray-700">
                  <span class="font-medium text-gray-900 dark:text-gray-100">Set Password</span>
                  <div class="mt-2 space-y-2">
                    <input
                      data-testid="link-basic-password"
                      type="password"
                      [value]="linkPassword()"
                      (input)="linkPassword.set($any($event.target).value)"
                      placeholder="Password"
                      class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      aria-label="New password"
                    />
                    <input
                      data-testid="link-basic-password-confirm"
                      type="password"
                      [value]="linkPasswordConfirm()"
                      (input)="linkPasswordConfirm.set($any($event.target).value)"
                      placeholder="Confirm password"
                      class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      aria-label="Confirm new password"
                    />
                    <button
                      data-testid="link-basic-btn"
                      (click)="linkBasic()"
                      [disabled]="linkingBasic()"
                      class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white
                           hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Set Password
                    </button>
                  </div>
                  @if (linkBasicError()) {
                    <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                      {{ linkBasicError() }}
                    </p>
                  }
                </div>
              }
            }

            <!-- OIDC credential -->
            @if (strategies().includes('oidc')) {
              <div
                class="flex items-center justify-between rounded-md border border-gray-200
                          px-4 py-3 dark:border-gray-700"
              >
                <div>
                  <span class="font-medium text-gray-900 dark:text-gray-100"
                    >Single Sign-On (OIDC)</span
                  >
                  @if (hasOidc()) {
                    <span class="ml-2 text-sm text-green-600 dark:text-green-400">Linked</span>
                  }
                </div>
                @if (canAddOidc()) {
                  <button
                    data-testid="link-oidc-btn"
                    (click)="linkOidc()"
                    class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white
                           hover:bg-indigo-700"
                  >
                    Link
                  </button>
                }
                @if (hasOidc() && canRemoveOidc()) {
                  <button
                    data-testid="unlink-oidc-btn"
                    (click)="unlinkOidc()"
                    class="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                }
              </div>
            }
          </div>
        </div>

        <div class="mt-12 border-t border-gray-200 pt-8 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-red-600 dark:text-red-400">Delete Account</h2>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This will permanently delete your rooms, messages, and friends list. Your game history
            will be preserved anonymously.
          </p>

          @if (confirmingDelete()) {
            <div class="mt-4 space-y-3">
              @if (authMethod() === 'basic') {
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enter your password to confirm
                  <input
                    data-testid="delete-password-input"
                    type="password"
                    [value]="deletePassword()"
                    (input)="deletePassword.set($any($event.target).value)"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                           text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    aria-label="Password confirmation for account deletion"
                  />
                </label>
              } @else {
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  You will be redirected to your identity provider to re-authenticate.
                </p>
              }
              @if (deleteError()) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ deleteError() }}</p>
              }
              <div class="flex gap-3">
                <button
                  data-testid="confirm-delete-btn"
                  (click)="confirmDelete()"
                  [disabled]="deleting()"
                  class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-red-700 disabled:opacity-50"
                >
                  @if (authMethod() === 'basic') {
                    Permanently Delete
                  } @else {
                    Re-authenticate & Delete
                  }
                </button>
                <button
                  data-testid="cancel-delete-btn"
                  (click)="cancelDelete()"
                  class="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100
                         dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          } @else {
            <button
              data-testid="delete-account-btn"
              (click)="startDelete()"
              class="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm font-medium
                     text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400
                     dark:hover:bg-red-950"
            >
              Delete Account
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class AccountPage implements OnInit {
  protected readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly authMethod = computed(() => {
    const user = this.auth.user();
    return user && 'authMethod' in user ? (user as any).authMethod : 'basic';
  });

  protected readonly editing = signal(false);
  protected readonly editValue = signal('');
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // Credential linking
  protected readonly linkPassword = signal('');
  protected readonly linkPasswordConfirm = signal('');
  protected readonly linkingBasic = signal(false);
  protected readonly linkBasicError = signal<string | null>(null);
  protected readonly unlinkingBasic = signal(false);
  protected readonly unlinkPassword = signal('');
  protected readonly confirmingUnlinkBasic = signal(false);
  protected readonly unlinkBasicError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly credentialError = signal<string | null>(null);

  protected readonly credentials = computed(() => this.auth.credentials());
  protected readonly strategies = computed(() => this.auth.strategies());
  protected readonly hasBasic = computed(() => this.credentials().includes('basic'));
  protected readonly hasOidc = computed(() => this.credentials().includes('oidc'));
  protected readonly canAddBasic = computed(
    () => !this.hasBasic() && this.strategies().includes('basic'),
  );
  protected readonly canAddOidc = computed(
    () => !this.hasOidc() && this.strategies().includes('oidc'),
  );
  protected readonly canRemoveBasic = computed(() => {
    if (!this.hasBasic()) return false;
    const otherEnabled = this.credentials().some(
      (m) => m !== 'basic' && this.strategies().includes(m),
    );
    return otherEnabled;
  });
  protected readonly canRemoveOidc = computed(() => {
    if (!this.hasOidc()) return false;
    const otherEnabled = this.credentials().some(
      (m) => m !== 'oidc' && this.strategies().includes(m),
    );
    return otherEnabled;
  });

  // Delete account
  protected readonly confirmingDelete = signal(false);
  protected readonly deletePassword = signal('');
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  ngOnInit(): void {
    this.userService.loadProfile();
    this.auth.loadCredentials();

    const params = this.route.snapshot.queryParams;
    if (params['action'] === 'delete-account') {
      this.triggerOidcDeletion();
    } else if (params['linked'] === 'oidc') {
      this.successMessage.set('OIDC account linked successfully');
    } else if (params['unlinked'] === 'oidc') {
      this.successMessage.set('OIDC account unlinked successfully');
    } else if (params['error'] === 'oidc_conflict') {
      this.credentialError.set('This OIDC identity is already linked to another account');
    } else if (params['error'] === 'last_credential') {
      this.credentialError.set('Cannot remove your only login method');
    } else if (params['error'] === 'session_expired') {
      this.credentialError.set('Session expired. Please try again.');
    }
  }

  private triggerOidcDeletion(): void {
    this.confirmingDelete.set(true);
    this.deleting.set(true);
    this.deleteError.set(null);

    this.userService
      .deleteAccount()
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        error: (err) => {
          if (err.status === 403) {
            this.deleteError.set('Re-authentication expired. Please try again.');
          } else {
            this.deleteError.set('Failed to delete account');
          }
        },
      });
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

  protected startDelete(): void {
    this.deletePassword.set('');
    this.deleteError.set(null);
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    this.deleteError.set(null);
  }

  protected confirmDelete(): void {
    if (this.authMethod() === 'oidc') {
      window.location.href = '/api/auth/oidc/login?action=delete-account';
      return;
    }

    const password = this.deletePassword();
    if (!password) {
      this.deleteError.set('Password is required');
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.userService
      .deleteAccount(password)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        error: (err) => {
          if (err.status === 401) {
            this.deleteError.set('Incorrect password');
          } else {
            this.deleteError.set('Failed to delete account');
          }
        },
      });
  }

  protected linkBasic(): void {
    this.successMessage.set(null);
    this.credentialError.set(null);

    const pw = this.linkPassword();
    const confirm = this.linkPasswordConfirm();
    if (!pw || pw.length < 1) {
      this.linkBasicError.set('Password is required');
      return;
    }
    if (pw !== confirm) {
      this.linkBasicError.set('Passwords do not match');
      return;
    }
    this.linkingBasic.set(true);
    this.linkBasicError.set(null);

    this.auth
      .linkBasicCredential(pw)
      .pipe(finalize(() => this.linkingBasic.set(false)))
      .subscribe({
        next: () => {
          this.linkPassword.set('');
          this.linkPasswordConfirm.set('');
          this.successMessage.set('Password set successfully');
        },
        error: (err) => {
          if (err.status === 409) {
            this.linkBasicError.set('A password is already set on this account');
          } else {
            this.linkBasicError.set('Failed to set password');
          }
        },
      });
  }

  protected startUnlinkBasic(): void {
    this.successMessage.set(null);
    this.credentialError.set(null);
    this.unlinkPassword.set('');
    this.unlinkBasicError.set(null);
    this.confirmingUnlinkBasic.set(true);
  }

  protected cancelUnlinkBasic(): void {
    this.confirmingUnlinkBasic.set(false);
    this.unlinkBasicError.set(null);
  }

  protected confirmUnlinkBasic(): void {
    const pw = this.unlinkPassword();
    if (!pw) {
      this.unlinkBasicError.set('Password is required');
      return;
    }
    this.unlinkingBasic.set(true);
    this.unlinkBasicError.set(null);

    this.auth
      .unlinkBasicCredential(pw)
      .pipe(finalize(() => this.unlinkingBasic.set(false)))
      .subscribe({
        next: () => {
          this.confirmingUnlinkBasic.set(false);
          this.successMessage.set('Password removed');
        },
        error: (err) => {
          if (err.status === 401) {
            this.unlinkBasicError.set('Incorrect password');
          } else if (err.status === 409) {
            this.unlinkBasicError.set('Cannot remove your only login method');
          } else {
            this.unlinkBasicError.set('Failed to remove password');
          }
        },
      });
  }

  protected linkOidc(): void {
    this.successMessage.set(null);
    this.credentialError.set(null);
    window.location.href = '/api/auth/oidc/login?action=link';
  }

  protected unlinkOidc(): void {
    this.successMessage.set(null);
    this.credentialError.set(null);
    window.location.href = '/api/auth/oidc/login?action=unlink';
  }

  protected formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  }
}
