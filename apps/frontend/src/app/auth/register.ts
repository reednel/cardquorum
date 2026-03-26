import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
    <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div class="w-full max-w-sm rounded-lg bg-white p-8 shadow dark:bg-gray-900">
        <h1 class="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Register
        </h1>

        @if (errorMessage()) {
          <div
            id="register-error"
            class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400"
            role="alert"
          >
            {{ errorMessage() }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-4">
            <label
              for="username"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
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
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ USERNAME_MIN }}–{{ USERNAME_MAX }} characters, letters/numbers/underscores
            </p>
          </div>

          <div class="mb-6">
            <label
              for="password"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Password
            </label>
            <input
              id="password"
              formControlName="password"
              type="password"
              autocomplete="new-password"
              required
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ PASSWORD_MIN }}–{{ PASSWORD_MAX }} characters
            </p>
          </div>

          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:text-gray-200"
          >
            {{ submitting() ? 'Registering...' : 'Register' }}
          </button>
        </form>

        <p class="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?
          <a routerLink="/login" class="text-indigo-600 hover:underline dark:text-indigo-400">
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
  });

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth
      .register(this.form.getRawValue())
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
