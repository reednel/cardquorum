import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import {
  DISPLAY_NAME_MAX,
  isValidUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
} from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { UserService } from './user.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-account-page',
  template: `
    @if (!userService.profile()) {
      <p
        data-testid="loading-state"
        class="text-sm text-text-secondary dark:text-text-secondary-dark"
      >
        Loading...
      </p>
    } @else {
      <dl class="space-y-4">
        <div>
          <dt class="text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
            Username
          </dt>
          <dd class="mt-1">
            @if (usernameEditing()) {
              <div class="flex items-center gap-2">
                <input
                  data-testid="username-input"
                  type="text"
                  [value]="usernameEditValue()"
                  (input)="usernameEditValue.set($any($event.target).value)"
                  [attr.maxlength]="USERNAME_MAX"
                  class="rounded-default border border-border-input px-3 py-1.5 text-sm text-text-heading
                           dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                  aria-label="Username"
                />
                <button
                  data-testid="save-username-btn"
                  (click)="saveUsername()"
                  [disabled]="usernameSaving()"
                  class="rounded-default bg-primary px-3 py-1.5 text-sm font-medium text-white
                           hover:bg-primary-hover disabled:opacity-disabled"
                >
                  Save
                </button>
                <button
                  data-testid="cancel-edit-btn"
                  (click)="cancelUsernameEdit()"
                  class="rounded-default px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised
                           dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                >
                  Cancel
                </button>
              </div>
              @if (usernameErrorMessage()) {
                <p class="mt-1 text-sm text-danger dark:text-danger-light">
                  {{ usernameErrorMessage() }}
                </p>
              }
            } @else {
              <span class="text-text-heading dark:text-text-heading-dark">
                {{ userService.profile()!.username }}
              </span>
              <button
                data-testid="edit-username-btn"
                (click)="startUsernameEdit()"
                class="ml-2 text-sm text-primary hover:underline dark:text-primary-light-text"
              >
                Edit
              </button>
            }
          </dd>
        </div>

        <div>
          <dt class="text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
            Display Name
          </dt>
          <dd class="mt-1">
            @if (displayNameEditing()) {
              <div class="flex items-center gap-2">
                <input
                  data-testid="display-name-input"
                  type="text"
                  [value]="displayNameEditValue()"
                  (input)="displayNameEditValue.set($any($event.target).value)"
                  [attr.maxlength]="DISPLAY_NAME_MAX"
                  class="rounded-default border border-border-input px-3 py-1.5 text-sm text-text-heading
                           dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                  aria-label="Display name"
                />
                <button
                  data-testid="save-display-name-btn"
                  (click)="saveDisplayName()"
                  [disabled]="displayNameSaving()"
                  class="rounded-default bg-primary px-3 py-1.5 text-sm font-medium text-white
                           hover:bg-primary-hover disabled:opacity-disabled"
                >
                  Save
                </button>
                <button
                  data-testid="cancel-edit-btn"
                  (click)="cancelDisplayNameEdit()"
                  class="rounded-default px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised
                           dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                >
                  Cancel
                </button>
              </div>
              @if (displayNameErrorMessage()) {
                <p class="mt-1 text-sm text-danger dark:text-danger-light">
                  {{ displayNameErrorMessage() }}
                </p>
              }
            } @else {
              <span class="text-text-heading dark:text-text-heading-dark">
                @if (userService.profile()!.displayName) {
                  {{ userService.profile()!.displayName }}
                } @else {
                  <span data-testid="display-name-empty">Not set</span>
                }
              </span>
              <button
                data-testid="edit-display-name-btn"
                (click)="startDisplayNameEdit()"
                class="ml-2 text-sm text-primary hover:underline dark:text-primary-light-text"
              >
                Edit
              </button>
            }
          </dd>
        </div>

        <div>
          <dt class="text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
            Member Since
          </dt>
          <dd class="mt-1 text-text-heading dark:text-text-heading-dark">
            {{ formatDate(userService.profile()!.createdAt) }}
          </dd>
        </div>
      </dl>

      <div
        class="mt-8 border-t border-border pt-8 dark:border-border-dark"
        data-testid="linked-accounts"
      >
        <h2 class="text-lg font-semibold text-text-heading dark:text-text-heading-dark">
          Credentials
        </h2>

        @if (successMessage()) {
          <p class="mt-2 text-sm text-success dark:text-success-light">
            {{ successMessage() }}
          </p>
        }
        @if (credentialError()) {
          <p class="mt-2 text-sm text-danger dark:text-danger-light">
            {{ credentialError() }}
          </p>
        }

        <div class="mt-4 space-y-4">
          <!-- Password credential -->
          @if (hasBasic()) {
            <div
              class="flex items-center justify-between rounded-default border border-border
                        px-4 py-3 dark:border-border-dark"
            >
              <div>
                <span class="font-medium text-text-heading dark:text-text-heading-dark"
                  >Password</span
                >
                <span class="ml-2 text-sm text-success dark:text-success-light">Linked</span>
              </div>
              @if (canRemoveBasic()) {
                @if (confirmingUnlinkBasic()) {
                  <div class="flex items-center gap-2">
                    <input
                      data-testid="unlink-basic-password"
                      type="password"
                      [value]="unlinkPassword()"
                      (input)="unlinkPassword.set($any($event.target).value)"
                      placeholder="Enter password"
                      class="rounded-default border border-border-input px-2 py-1 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                      aria-label="Password to confirm removal"
                    />
                    <button
                      data-testid="confirm-unlink-basic-btn"
                      (click)="confirmUnlinkBasic()"
                      [disabled]="unlinkingBasic()"
                      class="rounded-default bg-danger px-3 py-1 text-sm font-medium text-white
                             hover:bg-danger-hover disabled:opacity-disabled"
                    >
                      Remove
                    </button>
                    <button
                      data-testid="cancel-unlink-basic-btn"
                      (click)="cancelUnlinkBasic()"
                      class="text-sm text-text-secondary hover:text-text-body dark:text-text-secondary-dark"
                    >
                      Cancel
                    </button>
                  </div>
                } @else {
                  <button
                    data-testid="unlink-basic-btn"
                    (click)="startUnlinkBasic()"
                    class="text-sm text-danger hover:underline dark:text-danger-light"
                  >
                    Remove
                  </button>
                }
              }
            </div>
            @if (unlinkBasicError()) {
              <p class="text-sm text-danger dark:text-danger-light">
                {{ unlinkBasicError() }}
              </p>
            }
            @if (changingPassword()) {
              <div class="rounded-default border border-border px-4 py-3 dark:border-border-dark">
                <span class="font-medium text-text-heading dark:text-text-heading-dark"
                  >Change Password</span
                >
                <div class="mt-2 space-y-2">
                  <input
                    data-testid="change-pw-current"
                    type="password"
                    [value]="changeCurrentPassword()"
                    (input)="changeCurrentPassword.set($any($event.target).value)"
                    placeholder="Current password"
                    autocomplete="current-password"
                    class="block w-full rounded-default border border-border-input px-3 py-2 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                    aria-label="Current password"
                  />
                  <input
                    data-testid="change-pw-new"
                    type="password"
                    [value]="changeNewPassword()"
                    (input)="changeNewPassword.set($any($event.target).value)"
                    placeholder="New password ({{ PASSWORD_MIN }}–{{ PASSWORD_MAX }} characters)"
                    autocomplete="new-password"
                    class="block w-full rounded-default border border-border-input px-3 py-2 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                    aria-label="New password"
                  />
                  <input
                    data-testid="change-pw-confirm"
                    type="password"
                    [value]="changeConfirmPassword()"
                    (input)="changeConfirmPassword.set($any($event.target).value)"
                    placeholder="Confirm new password"
                    autocomplete="new-password"
                    class="block w-full rounded-default border border-border-input px-3 py-2 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                    aria-label="Confirm new password"
                  />
                  <div class="flex gap-2">
                    <button
                      data-testid="change-pw-submit"
                      (click)="submitChangePassword()"
                      [disabled]="changingPasswordSubmitting()"
                      class="rounded-default bg-primary px-4 py-2 text-sm font-medium text-white
                               hover:bg-primary-hover disabled:opacity-disabled"
                    >
                      Update Password
                    </button>
                    <button
                      data-testid="change-pw-cancel"
                      (click)="cancelChangePassword()"
                      class="rounded-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised
                               dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                @if (changePasswordError()) {
                  <p class="mt-1 text-sm text-danger dark:text-danger-light">
                    {{ changePasswordError() }}
                  </p>
                }
              </div>
            } @else {
              <button
                data-testid="change-pw-btn"
                (click)="startChangePassword()"
                class="text-sm text-primary hover:underline dark:text-primary-light-text"
              >
                Change Password
              </button>
            }
          }

          @if (canAddBasic()) {
            <div class="rounded-default border border-border px-4 py-3 dark:border-border-dark">
              @if (!linkingBasicExpanded()) {
                <div class="flex items-center justify-between">
                  <span class="font-medium text-text-heading dark:text-text-heading-dark"
                    >Password</span
                  >
                  <button
                    data-testid="link-basic-expand-btn"
                    (click)="linkingBasicExpanded.set(true)"
                    class="rounded-default bg-primary px-3 py-1.5 text-sm font-medium text-white
                             hover:bg-primary-hover"
                  >
                    Link
                  </button>
                </div>
              } @else {
                <span class="font-medium text-text-heading dark:text-text-heading-dark"
                  >Set Password</span
                >
                <div class="mt-2 space-y-2">
                  <input
                    data-testid="link-basic-password"
                    type="password"
                    [value]="linkPassword()"
                    (input)="linkPassword.set($any($event.target).value)"
                    placeholder="Password ({{ PASSWORD_MIN }}–{{ PASSWORD_MAX }} characters)"
                    class="block w-full rounded-default border border-border-input px-3 py-2 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                    aria-label="New password"
                  />
                  <input
                    data-testid="link-basic-password-confirm"
                    type="password"
                    [value]="linkPasswordConfirm()"
                    (input)="linkPasswordConfirm.set($any($event.target).value)"
                    placeholder="Confirm password"
                    class="block w-full rounded-default border border-border-input px-3 py-2 text-sm
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                    aria-label="Confirm new password"
                  />
                  <div class="flex gap-2">
                    <button
                      data-testid="link-basic-btn"
                      (click)="linkBasic()"
                      [disabled]="linkingBasic()"
                      class="rounded-default bg-primary px-4 py-2 text-sm font-medium text-white
                               hover:bg-primary-hover disabled:opacity-disabled"
                    >
                      Set Password
                    </button>
                    <button
                      data-testid="cancel-link-basic-btn"
                      (click)="cancelLinkBasic()"
                      class="rounded-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised
                               dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                @if (linkBasicError()) {
                  <p class="mt-1 text-sm text-danger dark:text-danger-light">
                    {{ linkBasicError() }}
                  </p>
                }
              }
            </div>
          }

          <!-- OIDC credential -->
          @if (strategies().includes('oidc')) {
            <div
              class="flex items-center justify-between rounded-default border border-border
                          px-4 py-3 dark:border-border-dark"
            >
              <div>
                <span class="font-medium text-text-heading dark:text-text-heading-dark"
                  >Single Sign-On (OIDC)</span
                >
                @if (hasOidc()) {
                  <span class="ml-2 text-sm text-success dark:text-success-light">Linked</span>
                }
              </div>
              @if (canAddOidc()) {
                <button
                  data-testid="link-oidc-btn"
                  (click)="linkOidc()"
                  class="rounded-default bg-primary px-3 py-1.5 text-sm font-medium text-white
                           hover:bg-primary-hover"
                >
                  Link
                </button>
              }
              @if (hasOidc() && canRemoveOidc()) {
                <button
                  data-testid="unlink-oidc-btn"
                  (click)="unlinkOidc()"
                  class="text-sm text-danger hover:underline dark:text-danger-light"
                >
                  Remove
                </button>
              }
            </div>
          }
        </div>
      </div>

      <div class="mt-12 border-t border-border pt-8 dark:border-border-dark">
        <h2 class="text-lg font-semibold text-danger dark:text-danger-light">Delete Account</h2>
        <p class="mt-2 text-sm text-text-secondary dark:text-text-secondary-dark">
          This will permanently delete your rooms, messages, and friends list. Your game history
          will be preserved anonymously.
        </p>

        @if (confirmingDelete()) {
          <div class="mt-4 space-y-3">
            @if (hasBasicCredential()) {
              <label class="block text-sm font-medium text-text-body dark:text-text-body-dark">
                Enter your password to confirm
                <input
                  data-testid="delete-password-input"
                  type="password"
                  [value]="deletePassword()"
                  (input)="deletePassword.set($any($event.target).value)"
                  class="mt-1 block w-full rounded-default border border-border-input px-3 py-2 text-sm
                           text-text-heading dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                  aria-label="Password confirmation for account deletion"
                />
              </label>
            } @else {
              <p class="text-sm text-text-secondary dark:text-text-secondary-dark">
                This action cannot be undone. Are you sure?
              </p>
            }
            @if (deleteError()) {
              <p class="text-sm text-danger dark:text-danger-light">{{ deleteError() }}</p>
            }
            <div class="flex gap-3">
              <button
                data-testid="confirm-delete-btn"
                (click)="confirmDelete()"
                [disabled]="deleting()"
                class="rounded-default bg-danger px-4 py-2 text-sm font-medium text-white
                         hover:bg-danger-hover disabled:opacity-disabled"
              >
                @if (hasBasicCredential()) {
                  Permanently Delete
                } @else {
                  Confirm & Delete
                }
              </button>
              <button
                data-testid="cancel-delete-btn"
                (click)="cancelDelete()"
                class="rounded-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised
                         dark:text-text-secondary-dark dark:hover:bg-surface-dark"
              >
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <button
            data-testid="delete-account-btn"
            (click)="startDelete()"
            class="mt-4 rounded-default border border-danger-border px-4 py-2 text-sm font-medium
                     text-danger hover:bg-danger-surface dark:border-danger-hover dark:text-danger-light
                     dark:hover:bg-danger-surface-dark"
          >
            Delete Account
          </button>
        }
      </div>
    }
  `,
})
export class AccountPage implements OnInit {
  protected readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly USERNAME_MIN = USERNAME_MIN;
  protected readonly USERNAME_MAX = USERNAME_MAX;
  protected readonly DISPLAY_NAME_MAX = DISPLAY_NAME_MAX;
  protected readonly PASSWORD_MIN = PASSWORD_MIN;
  protected readonly PASSWORD_MAX = PASSWORD_MAX;

  protected readonly hasBasicCredential = computed(() => this.auth.credentials().includes('basic'));

  protected readonly usernameEditing = signal(false);
  protected readonly usernameEditValue = signal('');
  protected readonly usernameSaving = signal(false);
  protected readonly usernameErrorMessage = signal<string | null>(null);

  protected readonly displayNameEditing = signal(false);
  protected readonly displayNameEditValue = signal('');
  protected readonly displayNameSaving = signal(false);
  protected readonly displayNameErrorMessage = signal<string | null>(null);

  // Credential linking
  protected readonly linkingBasicExpanded = signal(false);
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

  // Change password
  protected readonly changingPassword = signal(false);
  protected readonly changeCurrentPassword = signal('');
  protected readonly changeNewPassword = signal('');
  protected readonly changeConfirmPassword = signal('');
  protected readonly changingPasswordSubmitting = signal(false);
  protected readonly changePasswordError = signal<string | null>(null);

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
    } else if (params['linked'] === 'password') {
      this.successMessage.set('Password login added successfully');
    } else if (params['unlinked'] === 'oidc') {
      this.successMessage.set('OIDC account unlinked successfully');
    } else if (params['unlinked'] === 'password') {
      this.successMessage.set('Password login removed successfully');
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

  protected startUsernameEdit(): void {
    this.usernameEditValue.set(this.userService.profile()?.username ?? '');
    this.usernameErrorMessage.set(null);
    this.usernameEditing.set(true);
  }

  protected cancelUsernameEdit(): void {
    this.usernameEditing.set(false);
    this.usernameErrorMessage.set(null);
  }

  protected saveUsername(): void {
    const trimmed = this.usernameEditValue().trim();
    if (!isValidUsername(trimmed)) {
      this.usernameErrorMessage.set(
        `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters, start with a letter, and contain only letters, numbers, and underscores`,
      );
      return;
    }

    this.usernameSaving.set(true);
    this.usernameErrorMessage.set(null);

    this.userService
      .updateUsername(trimmed)
      .pipe(finalize(() => this.usernameSaving.set(false)))
      .subscribe({
        next: () => this.usernameEditing.set(false),
        error: () => this.usernameErrorMessage.set('Failed to update username'),
      });
  }

  protected startDisplayNameEdit(): void {
    this.displayNameEditValue.set(this.userService.profile()?.displayName ?? '');
    this.displayNameErrorMessage.set(null);
    this.displayNameEditing.set(true);
  }

  protected cancelDisplayNameEdit(): void {
    this.displayNameEditing.set(false);
    this.displayNameErrorMessage.set(null);
  }

  protected saveDisplayName(): void {
    const trimmed = this.displayNameEditValue().trim();
    if (trimmed.length > DISPLAY_NAME_MAX) {
      this.displayNameErrorMessage.set(
        `Display name must be ${DISPLAY_NAME_MAX} characters or fewer`,
      );
      return;
    }

    this.displayNameSaving.set(true);
    this.displayNameErrorMessage.set(null);

    this.userService
      .updateDisplayName(trimmed || null)
      .pipe(finalize(() => this.displayNameSaving.set(false)))
      .subscribe({
        next: () => this.displayNameEditing.set(false),
        error: () => this.displayNameErrorMessage.set('Failed to update display name'),
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
    if (!this.hasBasicCredential()) {
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

  protected startChangePassword(): void {
    this.successMessage.set(null);
    this.credentialError.set(null);
    this.changeCurrentPassword.set('');
    this.changeNewPassword.set('');
    this.changeConfirmPassword.set('');
    this.changePasswordError.set(null);
    this.changingPassword.set(true);
  }

  protected cancelChangePassword(): void {
    this.changingPassword.set(false);
    this.changePasswordError.set(null);
  }

  protected submitChangePassword(): void {
    const current = this.changeCurrentPassword();
    const newPw = this.changeNewPassword();
    const confirm = this.changeConfirmPassword();

    if (!current) {
      this.changePasswordError.set('Current password is required');
      return;
    }
    if (newPw.length < PASSWORD_MIN || newPw.length > PASSWORD_MAX) {
      this.changePasswordError.set(
        `New password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
      );
      return;
    }
    if (newPw !== confirm) {
      this.changePasswordError.set('New passwords do not match');
      return;
    }

    this.changingPasswordSubmitting.set(true);
    this.changePasswordError.set(null);

    this.auth
      .changePassword(current, newPw)
      .pipe(finalize(() => this.changingPasswordSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.changingPassword.set(false);
          this.successMessage.set('Password changed successfully');
        },
        error: (err) => {
          if (err.status === 401) {
            this.changePasswordError.set('Current password is incorrect');
          } else {
            this.changePasswordError.set('Failed to change password');
          }
        },
      });
  }

  protected cancelLinkBasic(): void {
    this.linkingBasicExpanded.set(false);
    this.linkPassword.set('');
    this.linkPasswordConfirm.set('');
    this.linkBasicError.set(null);
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
    if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
      this.linkBasicError.set(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
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
          this.linkingBasicExpanded.set(false);
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
          if (err.status === 400 || err.status === 401) {
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
