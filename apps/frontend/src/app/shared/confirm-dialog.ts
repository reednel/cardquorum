import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-confirm-dialog',
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
    <dialog
      #dialog
      [attr.aria-labelledby]="titleId()"
      class="m-auto w-full max-w-sm rounded-lg bg-bg p-6 shadow-xl dark:bg-bg-dark
             backdrop:bg-black/50"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      <div>
        <h2
          [id]="titleId()"
          class="mb-2 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
        >
          {{ title() }}
        </h2>
        <p class="mb-6 text-sm text-text-body dark:text-text-body-dark">
          {{ message() }}
        </p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-default px-4 py-2 text-sm font-medium text-text-secondary
                   transition-colors hover:bg-surface-raised
                   dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark"
            (click)="close()"
            data-testid="confirm-dialog-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-default px-4 py-2 text-sm font-medium text-white
                   bg-danger transition-colors hover:bg-danger-hover
                   dark:bg-danger-hover dark:hover:bg-danger-dark-hover"
            (click)="onConfirm()"
            data-testid="confirm-dialog-confirm"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly titleId = input('confirm-dialog-title');

  readonly confirmed = output<void>();
  readonly closed = output<void>();

  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

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
    this.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl().nativeElement) {
      this.close();
    }
  }

  protected onConfirm(): void {
    const dialog = this.dialogEl().nativeElement;
    if (typeof dialog.close === 'function') dialog.close();
    this.confirmed.emit();
  }

  close(): void {
    const dialog = this.dialogEl().nativeElement;
    if (typeof dialog.close === 'function') dialog.close();
    this.closed.emit();
  }
}
