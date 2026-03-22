import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomResponse, RoomVisibility } from '@cardquorum/shared';
import { RoomService } from './room.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-create-room-modal',
  imports: [ReactiveFormsModule],
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
    <dialog
      #dialog
      aria-labelledby="create-room-title"
      class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900
             [&::backdrop]:bg-black/50"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      <div>
        <h2
          id="create-room-title"
          class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          Create Room
        </h2>

        @if (errorMessage()) {
          <div
            id="create-room-error"
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
              for="room-name"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Room Name
            </label>
            <input
              id="room-name"
              formControlName="name"
              type="text"
              required
              [attr.aria-describedby]="errorMessage() ? 'create-room-error' : null"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                     focus:border-indigo-500 focus:outline-none focus:ring-1
                     focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                     dark:text-gray-100"
            />
          </div>

          <div class="mb-6">
            <label
              for="room-visibility"
              class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Visibility
            </label>
            <select
              id="room-visibility"
              formControlName="visibility"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                     focus:border-indigo-500 focus:outline-none focus:ring-1
                     focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                     dark:text-gray-100"
            >
              <option value="public">Public</option>
              <option value="friends-only">Friends Only</option>
              <option value="invite-only">Invite Only</option>
            </select>
          </div>

          <div class="flex justify-end gap-3">
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
              [disabled]="form.invalid || submitting()"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                     hover:bg-indigo-700 disabled:bg-gray-400 disabled:text-gray-200
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {{ submitting() ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  `,
})
export class CreateRoomModal {
  readonly created = output<RoomResponse>();
  readonly closed = output<void>();

  private readonly roomService = inject(RoomService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    visibility: ['public'],
  });

  constructor() {
    afterNextRender(() => {
      this.dialogEl().nativeElement.showModal();
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    const { name, visibility } = this.form.getRawValue();
    this.roomService.createRoom({ name, visibility: visibility as RoomVisibility }).subscribe({
      next: (room) => {
        this.submitting.set(false);
        this.created.emit(room);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          err.status === 409 ? 'A room with that name already exists' : 'Something went wrong',
        );
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
