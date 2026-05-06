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
    <div class="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-bg-dark">
      <div class="w-full max-w-sm rounded-lg bg-bg p-8 shadow dark:bg-bg-dark">
        <h1
          class="mb-6 text-center text-2xl font-semibold text-text-heading dark:text-text-heading-dark"
        >
          Log in
        </h1>

        @if (errorMessage()) {
          <div
            id="login-error"
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
              [attr.aria-describedby]="errorMessage() ? 'login-error' : null"
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            />
          </div>

          <div class="mb-6">
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
              autocomplete="current-password"
              required
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            />
          </div>

          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="w-full rounded-default bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-text"
          >
            {{ submitting() ? 'Logging in...' : 'Log in' }}
          </button>
        </form>

        @if (showOidc()) {
          <div class="my-4 flex items-center gap-2">
            <div class="h-px flex-1 bg-border-input dark:bg-border-dark"></div>
            <span class="text-xs text-text-secondary dark:text-text-secondary-dark">or</span>
            <div class="h-px flex-1 bg-border-input dark:bg-border-dark"></div>
          </div>

          <a
            href="/api/auth/oidc/login"
            data-testid="sso-button"
            class="block w-full rounded-default border border-border-input px-4 py-2 text-center text-sm font-medium text-text-body hover:bg-surface dark:border-border-input-dark dark:text-text-body-dark dark:hover:bg-surface-dark"
          >
            Sign in with SSO
          </a>
        }

        <p class="mt-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          Don't have an account?
          <a routerLink="/register" class="text-primary underline dark:text-primary-light-text">
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
        next: () => this.navigateAfterLogin(),
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(
            err.status === 401 ? 'Invalid username or password' : 'Something went wrong',
          );
        },
      });
  }

  private navigateAfterLogin(): void {
    const returnUrl = sessionStorage.getItem('cq_return_url');
    sessionStorage.removeItem('cq_return_url');
    if (returnUrl && returnUrl.startsWith('/')) {
      this.router.navigateByUrl(returnUrl);
    } else {
      this.router.navigate(['/']);
    }
  }
}
