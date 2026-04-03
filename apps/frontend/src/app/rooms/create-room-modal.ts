import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { RoomResponse, RoomVisibility, UserSearchResult } from '@cardquorum/shared';
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
      class="m-auto w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900
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
            data-testid="error-message"
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

          <div class="mb-4">
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

          @if (form.value.visibility === 'invite-only') {
            <div class="mb-4">
              <label
                for="invite-search"
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Invite Users
              </label>
              <input
                id="invite-search"
                type="text"
                autocomplete="off"
                placeholder="Search by username..."
                class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                       focus:border-indigo-500 focus:outline-none focus:ring-1
                       focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                       dark:text-gray-100"
                (input)="onSearchInput($event)"
              />

              @if (searchResults().length > 0) {
                <ul
                  class="mt-1 max-h-32 overflow-y-auto rounded-md border border-gray-200
                         bg-white dark:border-gray-700 dark:bg-gray-800"
                  role="listbox"
                  aria-label="Search results"
                >
                  @for (user of searchResults(); track user.userId) {
                    <li>
                      <button
                        type="button"
                        role="option"
                        [attr.aria-selected]="false"
                        class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100
                               dark:text-gray-300 dark:hover:bg-gray-700"
                        (click)="addInvitee(user)"
                      >
                        {{ user.displayName ?? user.username }}
                        @if (user.displayName) {
                          <span class="text-gray-400">({{ user.username }})</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              }

              @if (invitedUsers().length > 0) {
                <div class="mt-2 flex flex-wrap gap-1">
                  @for (user of invitedUsers(); track user.userId) {
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5
                             text-xs font-medium text-indigo-800 dark:bg-indigo-900/30
                             dark:text-indigo-400"
                    >
                      {{ user.displayName ?? user.username }}
                      <button
                        type="button"
                        (click)="removeInvitee(user.userId)"
                        class="ml-0.5 hover:text-indigo-600 dark:hover:text-indigo-200"
                        [attr.aria-label]="'Remove ' + (user.displayName ?? user.username)"
                      >
                        ×
                      </button>
                    </span>
                  }
                </div>
              }
            </div>
          }

          <div class="flex justify-end gap-3">
            <button
              type="button"
              data-testid="cancel-btn"
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
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly searchResults = signal<UserSearchResult[]>([]);
  protected readonly invitedUsers = signal<UserSearchResult[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    visibility: ['public'],
  });

  constructor() {
    afterNextRender(() => {
      this.dialogEl().nativeElement.showModal();
    });
  }

  protected onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value.trim();
    if (!query) {
      this.searchResults.set([]);
      return;
    }
    const invitedIds = new Set(this.invitedUsers().map((u) => u.userId));
    this.http.get<UserSearchResult[]>('/api/users/search', { params: { q: query } }).subscribe({
      next: (results) => {
        this.searchResults.set(results.filter((r) => !invitedIds.has(r.userId)));
      },
    });
  }

  protected addInvitee(user: UserSearchResult): void {
    if (this.invitedUsers().some((u) => u.userId === user.userId)) return;
    this.invitedUsers.update((list) => [...list, user]);
    this.searchResults.update((list) => list.filter((r) => r.userId !== user.userId));
  }

  protected removeInvitee(userId: number): void {
    this.invitedUsers.update((list) => list.filter((u) => u.userId !== userId));
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    const { name, visibility } = this.form.getRawValue();
    const invitedUserIds =
      visibility === 'invite-only' ? this.invitedUsers().map((u) => u.userId) : undefined;

    this.roomService
      .createRoom({ name, visibility: visibility as RoomVisibility, invitedUserIds })
      .subscribe({
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
