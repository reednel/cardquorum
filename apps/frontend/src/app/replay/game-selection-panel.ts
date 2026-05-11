import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { ReplaySessionSummary } from '@cardquorum/shared';
import { GAME_TABLE_COMPONENTS } from '../game/game-registry';
import { ReplayApiService, type SessionListParams } from './replay-api.service';

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-game-selection-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="mb-3 space-y-2">
      <div>
        <label
          for="game-type-filter"
          class="block text-xs font-medium text-text-secondary dark:text-text-secondary-dark"
        >
          Game type
        </label>
        <select
          id="game-type-filter"
          [ngModel]="gameTypeFilter()"
          (ngModelChange)="onGameTypeChange($event)"
          class="mt-0.5 w-full rounded-default border border-border bg-surface px-2 py-1 text-sm
                 text-text-heading dark:border-border-dark dark:bg-surface-dark dark:text-white"
        >
          <option value="">All</option>
          @for (type of availableGameTypes; track type) {
            <option [value]="type">{{ formatGameType(type) }}</option>
          }
        </select>
      </div>

      <label
        class="flex items-center gap-2 text-xs text-text-secondary dark:text-text-secondary-dark"
      >
        <input
          type="checkbox"
          [ngModel]="includeIncomplete()"
          (ngModelChange)="onIncludeIncompleteChange($event)"
          class="rounded border-border dark:border-border-dark"
        />
        Include incomplete games
      </label>
    </div>

    @switch (panelState().status) {
      @case ('loading') {
        <div class="flex flex-1 items-center justify-center" role="status">
          <p class="text-xs text-text-secondary dark:text-text-secondary-dark">Loading games…</p>
        </div>
      }
      @case ('error') {
        <div class="flex flex-1 flex-col items-center justify-center gap-2" role="alert">
          <p class="text-xs text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
          <button
            (click)="loadSessions()"
            class="rounded-default bg-primary px-3 py-1 text-xs text-white
                   transition-colors hover:bg-primary-hover"
          >
            Retry
          </button>
        </div>
      }
      @case ('success') {
        @if (sessions().length === 0) {
          <div class="flex flex-1 items-center justify-center">
            <p class="text-xs text-text-secondary dark:text-text-secondary-dark">No games found.</p>
          </div>
        } @else {
          <ul class="flex-1 space-y-1 overflow-y-auto" role="list">
            @for (session of sessions(); track session.sessionId) {
              <li>
                <button
                  (click)="selectSession(session.sessionId)"
                  class="w-full rounded-default px-2 py-2 text-left transition-colors
                         hover:bg-surface-raised dark:hover:bg-surface-raised-dark"
                  [attr.aria-label]="
                    'View replay for ' + formatGameType(session.gameType) + ' game'
                  "
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-text-heading dark:text-white">
                      {{ formatGameType(session.gameType) }}
                    </span>
                    @if (session.status !== 'finished') {
                      <span
                        class="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none
                               bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        {{ session.status }}
                      </span>
                    }
                  </div>
                  <div class="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
                    @if (session.roomName) {
                      <span>{{ session.roomName }}</span>
                      <span class="mx-1">·</span>
                    }
                    <span>{{ formatDateTime(session.startedAt) }}</span>
                  </div>
                </button>
              </li>
            }
          </ul>

          @if (nextCursor()) {
            <button
              (click)="loadMore()"
              [disabled]="isLoadingMore()"
              class="mt-2 w-full rounded-default border border-border px-3 py-1.5 text-xs
                     text-text-secondary transition-colors hover:bg-surface-raised
                     disabled:opacity-50 dark:border-border-dark dark:text-text-secondary-dark
                     dark:hover:bg-surface-raised-dark"
            >
              {{ isLoadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          }
        }
      }
    }
  `,
  host: { class: 'flex flex-1 flex-col min-h-0' },
})
export class GameSelectionPanel {
  private readonly replayApi = inject(ReplayApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Available game types derived from the game registry. */
  protected readonly availableGameTypes = Object.keys(GAME_TABLE_COMPONENTS);

  /** Filter: game type (empty string = all). */
  protected readonly gameTypeFilter = signal('');

  /** Filter: include incomplete sessions. */
  protected readonly includeIncomplete = signal(false);

  /** Current panel loading state. */
  protected readonly panelState = signal<PanelState>({ status: 'idle' });

  /** Loaded sessions. */
  protected readonly sessions = signal<ReplaySessionSummary[]>([]);

  /** Cursor for next page. */
  protected readonly nextCursor = signal<string | null>(null);

  /** Whether a "load more" request is in progress. */
  protected readonly isLoadingMore = signal(false);

  /** Error message for display. */
  protected readonly errorMessage = computed(() => {
    const state = this.panelState();
    return state.status === 'error' ? state.message : '';
  });

  constructor() {
    this.loadSessions();
  }

  /** Load sessions from the API (resets list). */
  protected loadSessions(): void {
    this.panelState.set({ status: 'loading' });
    this.sessions.set([]);
    this.nextCursor.set(null);

    const params = this.buildParams();

    this.replayApi
      .getSessions(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.sessions.set(response.sessions);
          this.nextCursor.set(response.nextCursor);
          this.panelState.set({ status: 'success' });
        },
        error: () => {
          this.panelState.set({
            status: 'error',
            message: 'Failed to load games. Please try again.',
          });
        },
      });
  }

  /** Load more sessions (append to list). */
  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.isLoadingMore()) return;

    this.isLoadingMore.set(true);

    const params = this.buildParams(cursor);

    this.replayApi
      .getSessions(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.sessions.update((prev) => [...prev, ...response.sessions]);
          this.nextCursor.set(response.nextCursor);
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.isLoadingMore.set(false);
        },
      });
  }

  /** Handle game type filter change. */
  protected onGameTypeChange(value: string): void {
    this.gameTypeFilter.set(value);
    this.loadSessions();
  }

  /** Handle include incomplete toggle change. */
  protected onIncludeIncompleteChange(value: boolean): void {
    this.includeIncomplete.set(value);
    this.loadSessions();
  }

  /** Navigate to the selected session's replay. */
  protected selectSession(sessionId: number): void {
    this.router.navigate(['/replay'], { queryParams: { session: sessionId } });
  }

  /** Format a game type string for display (title case). */
  protected formatGameType(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /** Format an ISO date string for display. */
  protected formatDateTime(iso: string | null): string {
    if (!iso) return 'Unknown date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  /** Build API params from current filter state. */
  private buildParams(cursor?: string): SessionListParams {
    const params: SessionListParams = { limit: 20 };

    const gameType = this.gameTypeFilter();
    if (gameType) {
      params.gameType = gameType;
    }

    if (this.includeIncomplete()) {
      params.includeIncomplete = true;
    }

    if (cursor) {
      params.cursor = cursor;
    }

    return params;
  }
}
