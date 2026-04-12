import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomResponse } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-config-modal',
  imports: [ReactiveFormsModule],
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
    <dialog
      #dialog
      aria-labelledby="config-room-title"
      class="m-auto w-full max-w-md rounded-lg bg-bg p-6 shadow-xl dark:bg-bg-dark
             [&::backdrop]:bg-black/50"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      <div>
        <h2
          id="config-room-title"
          class="mb-4 text-lg font-semibold text-text-heading dark:text-text-heading-dark"
        >
          Room Settings
        </h2>

        @if (errorMessage()) {
          <div
            id="config-room-error"
            data-testid="error-message"
            class="mb-4 rounded-default bg-danger-surface p-3 text-sm text-danger
                   dark:bg-danger-surface-dark dark:text-danger-light"
            role="alert"
          >
            {{ errorMessage() }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-4">
            <label
              for="config-room-name"
              class="mb-1 block text-sm font-medium text-text-body dark:text-text-body-dark"
            >
              Room Name
            </label>
            <input
              id="config-room-name"
              formControlName="name"
              type="text"
              required
              [attr.aria-describedby]="errorMessage() ? 'config-room-error' : null"
              class="w-full rounded-default border border-border-input px-3 py-2 text-sm
                     dark:border-border-input-dark dark:bg-surface-dark
                     dark:text-text-heading-dark"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              @if (confirmDelete()) {
                <span class="mr-2 text-sm text-danger dark:text-danger-light">
                  Are you sure? This cannot be undone.
                </span>
                <button
                  type="button"
                  data-testid="confirm-delete-room-btn"
                  (click)="onConfirmDelete()"
                  [disabled]="submitting()"
                  class="mr-1 rounded-default bg-danger px-3 py-1 text-xs font-medium text-white
                         hover:bg-danger-hover disabled:bg-disabled disabled:text-disabled-text"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  (click)="confirmDelete.set(false)"
                  class="rounded-default px-3 py-1 text-xs text-text-secondary hover:bg-surface-raised
                         dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                >
                  Cancel
                </button>
              } @else {
                <button
                  type="button"
                  data-testid="delete-room-btn"
                  (click)="confirmDelete.set(true)"
                  class="rounded-default px-3 py-1 text-sm text-danger hover:bg-danger-surface
                         dark:text-danger-light dark:hover:bg-danger-surface-dark"
                >
                  Delete Room
                </button>
              }
            </div>

            <div class="flex gap-3">
              <button
                type="button"
                (click)="close()"
                class="rounded-default px-4 py-2 text-sm text-text-body hover:bg-surface-raised
                       dark:text-text-body-dark dark:hover:bg-surface-dark"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="form.invalid || form.pristine || submitting()"
                class="rounded-default bg-primary px-4 py-2 text-sm font-semibold text-white
                       hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-text"
              >
                {{ submitting() ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </dialog>
  `,
})
export class RoomConfigModal implements OnInit {
  readonly room = input.required<RoomResponse>();
  readonly updated = output<RoomResponse>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  private readonly roomService = inject(RoomService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly confirmDelete = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
  });

  constructor() {
    afterNextRender(() => {
      this.dialogEl().nativeElement.showModal();
    });
  }

  ngOnInit(): void {
    const r = this.room();
    this.form.patchValue({ name: r.name });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.form.pristine) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    const { name } = this.form.getRawValue();
    this.roomService.updateRoom(this.room().id, { name }).subscribe({
      next: (room) => {
        this.submitting.set(false);
        this.updated.emit(room);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          err.status === 409 ? 'A room with that name already exists' : 'Something went wrong',
        );
      },
    });
  }

  protected onConfirmDelete(): void {
    if (this.submitting()) return;
    this.submitting.set(true);

    this.roomService.deleteRoom(this.room().id).subscribe({
      next: () => this.deleted.emit(),
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Failed to delete room');
      },
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

  protected close(): void {
    this.dialogEl().nativeElement.close();
    this.closed.emit();
  }
}
