import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { USERNAME_MAX, USERNAME_MIN } from '@cardquorum/shared';
import { AuthService } from './auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  selector: 'app-register',
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div class="w-full max-w-sm rounded-lg bg-white p-8 shadow dark:bg-gray-900">
        <h1 class="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Choose a Username
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

          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:text-gray-200"
          >
            {{ submitting() ? 'Registering...' : 'Continue' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class RegisterOidc {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly USERNAME_MIN = USERNAME_MIN;
  protected readonly USERNAME_MAX = USERNAME_MAX;

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
  });

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth
      .oidcRegister(this.form.getRawValue())
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
