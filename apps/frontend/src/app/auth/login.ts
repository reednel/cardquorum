import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from './auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div class="w-full max-w-sm rounded-lg bg-white p-8 shadow dark:bg-gray-900">
        <h1 class="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Log in
        </h1>

        @if (errorMessage()) {
          <div
            id="login-error"
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
              [attr.aria-describedby]="errorMessage() ? 'login-error' : null"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
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
              autocomplete="current-password"
              required
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:text-gray-200"
          >
            {{ submitting() ? 'Logging in...' : 'Log in' }}
          </button>
        </form>

        @if (showOidc()) {
          <div class="my-4 flex items-center gap-2">
            <div class="h-px flex-1 bg-gray-300 dark:bg-gray-700"></div>
            <span class="text-xs text-gray-500 dark:text-gray-400">or</span>
            <div class="h-px flex-1 bg-gray-300 dark:bg-gray-700"></div>
          </div>

          <a
            href="/api/auth/oidc/login"
            data-testid="sso-button"
            class="block w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign in with SSO
          </a>
        }

        <p class="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?
          <a routerLink="/register" class="text-indigo-600 hover:underline dark:text-indigo-400">
            Register
          </a>
        </p>
      </div>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly showOidc = computed(() => this.auth.strategies().includes('oidc'));

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    this.auth
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/']),
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(
            err.status === 401 ? 'Invalid username or password' : 'Something went wrong',
          );
        },
      });
  }
}
