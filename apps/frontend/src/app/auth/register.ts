import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@cardquorum/shared';
import { AuthService } from './auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-register',
  template: `
    <div class="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-bg-dark">
      <div class="w-full max-w-sm rounded-lg bg-bg p-8 shadow dark:bg-bg-dark">
        <h1
          class="mb-6 text-center text-2xl font-semibold text-text-heading dark:text-text-heading-dark"
        >
          Register
        </h1>

        @if (errorMessage()) {
          <div
            id="register-error"
            class="mb-4 rounded-default bg-danger-surface p-3 text-sm text-danger dark:bg-danger-surface-dark dark:text-danger-light"
            role="alert"
          >
            {{ errorMessage() }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-4">
            <label
              for="username"
              class="mb-1 block text-sm font-medium text-text-body dark:text-text-body-dark"
            >
              Username
            </label>
            <input
              id="username"
              formControlName="username"
              type="text"
              autocomplete="username"
              required
              [attr.aria-describedby]="errorMessage() ? 'register-error' : null"
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            />
            <p class="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
              {{ USERNAME_MIN }}–{{ USERNAME_MAX }} characters, letters/numbers/underscores
            </p>
          </div>

          <div class="mb-4">
            <label
              for="password"
              class="mb-1 block text-sm font-medium text-text-body dark:text-text-body-dark"
            >
              Password
            </label>
            <input
              id="password"
              formControlName="password"
              type="password"
              autocomplete="new-password"
              required
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            />
            <p class="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
              {{ PASSWORD_MIN }}–{{ PASSWORD_MAX }} characters
            </p>
          </div>

          <div class="mb-6">
            <label
              for="confirmPassword"
              class="mb-1 block text-sm font-medium text-text-body dark:text-text-body-dark"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              formControlName="confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            />
            @if (passwordMismatch()) {
              <p class="mt-1 text-xs text-danger dark:text-danger-light">Passwords do not match</p>
            }
          </div>

          <button
            type="submit"
            [disabled]="form.invalid || passwordMismatch() || submitting()"
            class="w-full rounded-default bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-text"
          >
            {{ submitting() ? 'Registering...' : 'Register' }}
          </button>
        </form>

        <p class="mt-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          Already have an account?
          <a routerLink="/login" class="text-primary underline dark:text-primary-light-text">
            Log in
          </a>
        </p>
      </div>
    </div>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly USERNAME_MIN = USERNAME_MIN;
  protected readonly USERNAME_MAX = USERNAME_MAX;
  protected readonly PASSWORD_MIN = PASSWORD_MIN;
  protected readonly PASSWORD_MAX = PASSWORD_MAX;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(USERNAME_MIN),
        Validators.maxLength(USERNAME_MAX),
        Validators.pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/),
      ],
    ],
    password: [
      '',
      [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
    ],
    confirmPassword: ['', Validators.required],
  });

  protected readonly passwordMismatch = computed(() => {
    const { password, confirmPassword } = this.form.getRawValue();
    return confirmPassword.length > 0 && password !== confirmPassword;
  });

  protected onSubmit(): void {
    if (this.form.invalid) return;

    const { password, confirmPassword } = this.form.getRawValue();
    if (password !== confirmPassword) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth
      .register({ username: this.form.getRawValue().username, password })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/']),
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(
            err.status === 409
              ? 'Username already taken'
              : (err.error?.message ?? 'Something went wrong'),
          );
        },
      });
  }
}
