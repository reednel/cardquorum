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
import { RoomService } from './room.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-config-modal',
  imports: [ReactiveFormsModule],
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
    <dialog
      #dialog
      aria-labelledby="config-room-title"
      class="m-auto w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900
             [&::backdrop]:bg-black/50"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      <div>
        <h2
          id="config-room-title"
          class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          Room Settings
        </h2>

        @if (errorMessage()) {
          <div
            id="config-room-error"
            class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700
                   dark:bg-red-900/30 dark:text-red-400"
            role="alert"
          >
            {{ errorMessage() }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-4">
            <label
              for="config-room-name"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Room Name
            </label>
            <input
              id="config-room-name"
              formControlName="name"
              type="text"
              required
              [attr.aria-describedby]="errorMessage() ? 'config-room-error' : null"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                     focus:border-indigo-500 focus:outline-none focus:ring-1
                     focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                     dark:text-gray-100"
            />
          </div>

          <div class="mb-6">
            <label
              for="config-room-visibility"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Visibility
            </label>
            <p
              id="config-room-visibility"
              class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm
                     text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              {{ room().visibility }}
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div>
              @if (confirmDelete()) {
                <span class="mr-2 text-sm text-red-600 dark:text-red-400">
                  Are you sure? This cannot be undone.
                </span>
                <button
                  type="button"
                  (click)="onConfirmDelete()"
                  [disabled]="submitting()"
                  class="mr-1 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white
                         hover:bg-red-700 disabled:bg-gray-400 disabled:text-gray-200
                         focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  (click)="confirmDelete.set(false)"
                  class="rounded-md px-3 py-1 text-xs text-gray-600 hover:bg-gray-100
                         dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              } @else {
                <button
                  type="button"
                  (click)="confirmDelete.set(true)"
                  class="rounded-md px-3 py-1 text-sm text-red-600 hover:bg-red-50
                         dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete Room
                </button>
              }
            </div>

            <div class="flex gap-3">
              <button
                type="button"
                (click)="close()"
                class="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100
                       dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="form.invalid || form.pristine || submitting()"
                class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                       hover:bg-indigo-700 disabled:bg-gray-400 disabled:text-gray-200
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
