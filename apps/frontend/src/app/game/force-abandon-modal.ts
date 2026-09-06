import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ForceAbandonService } from './force-abandon.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-force-abandon-modal',
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
    <dialog
      #dialog
      aria-labelledby="force-abandon-modal-title"
      class="m-auto w-full max-w-sm rounded-lg bg-bg p-6 shadow-xl dark:bg-bg-dark
             backdrop:bg-black/50"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      <div>
        <h2
          id="force-abandon-modal-title"
          class="mb-2 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
        >
          Turn Time Exceeded
        </h2>
        <p class="mb-2 text-sm text-text-body dark:text-text-body-dark">
          Player {{ playerName() }}'s turn has exceeded the time limit.
        </p>
        <p class="mb-6 text-sm font-medium text-text-heading dark:text-text-heading-dark">
          {{ formattedElapsed() }} elapsed
        </p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-default px-4 py-2 text-sm font-medium text-text-secondary
                   transition-colors hover:bg-hover-overlay
                   dark:text-text-secondary-dark dark:hover:bg-hover-overlay-dark"
            (click)="onDismiss()"
            data-testid="force-abandon-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-default px-4 py-2 text-sm font-medium text-white
                   bg-danger transition-colors hover:bg-danger-hover
                   dark:bg-danger-hover dark:hover:bg-danger-dark-hover"
            (click)="onConfirm()"
            data-testid="force-abandon-modal-confirm"
          >
            Force Abandon
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class ForceAbandonModal {
  readonly playerName = input.required<string>();
  readonly sessionId = input.required<number>();
  readonly targetUserId = input.required<number>();

  private readonly forceAbandonService = inject(ForceAbandonService);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly formattedElapsed = computed(() => {
    const seconds = this.forceAbandonService.elapsedSeconds();
    const m = Math.floor(seconds / 60);
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  });

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialogEl().nativeElement;
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.onDismiss();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl().nativeElement) {
      this.onDismiss();
    }
  }

  protected onConfirm(): void {
    const dialog = this.dialogEl().nativeElement;
    if (typeof dialog.close === 'function') dialog.close();
    this.forceAbandonService.confirmForceAbandon(this.sessionId(), this.targetUserId());
  }

  protected onDismiss(): void {
    const dialog = this.dialogEl().nativeElement;
    if (typeof dialog.close === 'function') dialog.close();
    this.forceAbandonService.dismissModal();
  }
}
