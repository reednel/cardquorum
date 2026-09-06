import { DOCUMENT, NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  viewChild,
  type ElementRef,
  type Type,
} from '@angular/core';
import type { UserIdentity } from '@cardquorum/shared';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-game-summary-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    <div
      #dialogEl
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="headingId"
      (mousedown)="onBackdropClick($event)"
    >
      <div
        class="flex max-h-[80vh] w-fit max-w-[90vw] flex-col rounded-xl bg-bg p-6 shadow-xl dark:bg-surface-dark"
      >
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h2 [id]="headingId" class="text-lg font-semibold text-text-heading dark:text-white">
            {{ heading() }}
          </h2>
          <button
            data-testid="summary-close-btn"
            (click)="dismiss()"
            aria-label="Close summary"
            class="rounded-lg p-1.5 text-text-secondary hover:bg-hover-overlay dark:text-text-secondary-dark dark:hover:bg-hover-overlay-dark"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <!-- Scrollable content area -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <ng-container *ngComponentOutlet="summaryComponent(); inputs: componentInputs()" />
        </div>

        <!-- Footer actions -->
        @if (showStartNext()) {
          <div class="mt-4 flex items-center justify-center">
            <button
              data-testid="summary-start-next-btn"
              (click)="startNextGame.emit()"
              aria-label="Start next game"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Start Next Game
            </button>
          </div>
        }
      </div>
    </div>
  `,
  host: {
    class: 'contents',
    '(keydown)': 'onKeydown($event)',
  },
})
export class GameSummaryShell {
  readonly mode = input.required<'end-of-game' | 'standalone'>();
  readonly summaryComponent = input.required<Type<unknown>>();
  readonly store = input.required<unknown>();
  readonly participants = input.required<UserIdentity[]>();
  readonly isOwner = input<boolean>(false);
  readonly canStartNext = input<boolean>(false);

  readonly dismissed = output<void>();
  readonly startNextGame = output<void>();

  protected readonly headingId = 'game-summary-heading';

  protected readonly heading = computed(() =>
    this.mode() === 'end-of-game' ? 'Game Over' : 'Game Summary',
  );

  protected readonly showStartNext = computed(
    () => this.mode() === 'end-of-game' && this.isOwner() && this.canStartNext(),
  );

  protected readonly componentInputs = computed(() => ({
    store: this.store(),
    participants: this.participants(),
  }));

  private readonly dialogEl = viewChild.required<ElementRef<HTMLElement>>('dialogEl');
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private previouslyFocusedElement: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      this.previouslyFocusedElement = (this.document.activeElement as HTMLElement) ?? null;

      const focusable = this.getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.previouslyFocusedElement?.focus();
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  dismiss(): void {
    this.previouslyFocusedElement?.focus();
    this.dismissed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl().nativeElement) {
      this.dismiss();
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const dialog = this.dialogEl().nativeElement;
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
