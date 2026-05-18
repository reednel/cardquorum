import { animate, style, transition, trigger } from '@angular/animations';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  Type,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { ReplayDataResponse, SummaryDataResponse, UserIdentity } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { GAME_TABLE_PLUGINS } from '../game/game-registry';
import { GameSummaryShell } from '../game/game-summary-shell';
import { SummaryApiService } from '../game/summary-api.service';
import { ReplayApiService } from './replay-api.service';
import { ReplayEngineService } from './replay-engine.service';
import { ReplaySidebar, type ReplaySidebarTab } from './replay-sidebar';
import { ReplayTable } from './replay-table';

type LoadingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ReplayDataResponse }
  | { status: 'error'; code: number; message: string };

@Component({
  selector: 'app-replay-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ReplayEngineService],
  imports: [FaIconComponent, GameSummaryShell, ReplaySidebar, ReplayTable],
  animations: [
    trigger('slidePanel', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('200ms ease-out', style({ transform: 'translateX(0)' })),
      ]),
      transition(':leave', [animate('150ms ease-in', style({ transform: 'translateX(100%)' }))]),
    ]),
  ],
  template: `
    <div class="flex h-full bg-bg text-text-heading dark:bg-bg-dark dark:text-white">
      <main
        [class]="viewMode() === 'replay' ? 'flex-1' : 'flex-1 flex items-center justify-center'"
      >
        @switch (viewMode()) {
          @case ('selection') {
            <div class="text-center text-text-secondary dark:text-text-secondary-dark">
              <p class="text-lg font-semibold">Game Replay</p>
              <p class="mt-2 text-sm">Select a game from the sidebar to watch a replay.</p>
            </div>
          }
          @case ('loading') {
            <div
              class="text-center text-text-secondary dark:text-text-secondary-dark"
              role="status"
            >
              <p class="text-sm">Loading replay…</p>
            </div>
          }
          @case ('error') {
            <div class="text-center" role="alert">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
              @if (showRetry()) {
                <button
                  (click)="retry()"
                  class="mt-3 rounded-default bg-primary px-4 py-2 text-sm text-white
                         transition-colors hover:bg-primary-hover"
                >
                  Retry
                </button>
              }
            </div>
          }
          @case ('replay') {
            <app-replay-table
              class="h-full w-full"
              [gameType]="replayData()!.gameType"
              [viewerUserId]="viewerUserId()"
              [participants]="replayParticipants()"
              [config]="replayData()!.config"
              [colorMap]="replayData()!.colorMap"
            />
          }
        }
      </main>

      @if (showSummaryOverlay()) {
        <app-game-summary-shell
          [mode]="'standalone'"
          [summaryComponent]="summaryComponent()!"
          [store]="summaryData()!.store"
          [participants]="summaryParticipants()"
          (dismissed)="dismissSummary()"
        />
      }

      @if (!panelOpen()) {
        <button
          (click)="togglePanel(true)"
          aria-label="Open side panel"
          class="absolute right-0 top-0 z-10 flex h-(--height-panel-header) items-center border-b border-l
                 border-border bg-surface px-1.5 text-text-secondary
                 transition-colors hover:bg-hover-overlay hover:text-text-body
                 dark:border-border-dark dark:bg-surface-dark
                 dark:text-text-secondary-dark dark:hover:bg-hover-overlay-dark
                 dark:hover:text-text-heading-dark"
        >
          <fa-icon [icon]="faChevronLeft" class="text-xs" aria-hidden="true" />
        </button>
      }

      @if (panelOpen()) {
        <aside
          @slidePanel
          class="flex w-80 shrink-0 flex-col border-l border-border bg-surface
                 dark:border-border-dark dark:bg-surface-dark"
        >
          <div
            class="flex h-(--height-panel-header) items-center border-b border-border
                   dark:border-border-dark"
          >
            <button
              (click)="togglePanel(false)"
              aria-label="Collapse side panel"
              class="flex h-(--height-panel-header) shrink-0 items-center border-r border-border
                     px-2 text-text-secondary transition-colors
                     hover:bg-hover-overlay hover:text-text-body
                     dark:border-border-dark dark:text-text-secondary-dark
                     dark:hover:bg-hover-overlay-dark dark:hover:text-text-heading-dark"
            >
              <fa-icon [icon]="faChevronRight" class="text-xs" aria-hidden="true" />
            </button>
            <p class="truncate px-2 text-sm font-semibold text-text-heading dark:text-white">
              Replay
            </p>
          </div>

          <app-replay-sidebar
            [tab]="sidebarTab()"
            [summaryButtonVisible]="summaryComponent() !== null"
            (tabChange)="sidebarTab.set($event)"
            (summaryRequested)="onSummaryButtonClick()"
            class="flex min-h-0 flex-1 flex-col"
          />
        </aside>
      }
    </div>
  `,
  host: {
    class: 'relative block overflow-hidden',
    style: 'height: calc(100% + 3rem)',
  },
})
export class ReplayPage {
  protected readonly faChevronLeft = faChevronLeft;
  protected readonly faChevronRight = faChevronRight;

  private readonly route = inject(ActivatedRoute);
  private readonly replayApi = inject(ReplayApiService);
  private readonly summaryApi = inject(SummaryApiService);
  private readonly replayEngine = inject(ReplayEngineService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly PANEL_KEY = 'cq_replay_panel';

  /** Panel open/close state. */
  protected readonly panelOpen = signal(localStorage.getItem(ReplayPage.PANEL_KEY) !== 'closed');

  /** Loading state for replay data. */
  protected readonly loadState = signal<LoadingState>({ status: 'idle' });

  /** Parsed session ID from query params (null if absent or invalid). */
  protected readonly sessionId = signal<number | null>(null);

  /** Fetched summary data (persisted store + participants). */
  protected readonly summaryData = signal<SummaryDataResponse | null>(null);

  /** Whether the summary overlay is currently visible. */
  protected readonly summaryOverlayVisible = signal(false);

  /** Timer handle for the 500ms delay before showing the summary. */
  private summaryDelayTimer: ReturnType<typeof setTimeout> | null = null;

  /** Whether the replay is at the final position with score phase. */
  protected readonly isAtFinalScorePosition = computed(() => {
    const position = this.replayEngine.currentPosition();
    const total = this.replayEngine.totalEvents();
    if (total === 0 || position < total) return false;

    const view = this.replayEngine.playerView() as { phase?: string } | null;
    return view?.phase === 'score';
  });

  /** The summary component type from the plugin (if available). */
  protected readonly summaryComponent = computed<Type<unknown> | null>(() => {
    const data = this.replayData();
    if (!data) return null;
    const plugin = GAME_TABLE_PLUGINS[data.gameType];
    return plugin?.getSummaryComponent?.() ?? null;
  });

  /** Participants mapped for the summary shell (UserIdentity format). */
  protected readonly summaryParticipants = computed<UserIdentity[]>(() => {
    const data = this.summaryData();
    if (!data) return [];
    return data.participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
    }));
  });

  /** Whether to show the summary overlay (all conditions met). */
  protected readonly showSummaryOverlay = computed(
    () =>
      this.summaryOverlayVisible() &&
      this.summaryData() !== null &&
      this.summaryComponent() !== null,
  );

  /** Determines which view to show based on session param and load state. */
  protected readonly viewMode = computed<'selection' | 'loading' | 'error' | 'replay'>(() => {
    const id = this.sessionId();
    if (id === null) return 'selection';

    const state = this.loadState();
    switch (state.status) {
      case 'idle':
      case 'loading':
        return 'loading';
      case 'error':
        return 'error';
      case 'success':
        return 'replay';
    }
  });

  /** Error message for display. */
  protected readonly errorMessage = computed(() => {
    const state = this.loadState();
    if (state.status === 'error') return state.message;
    return '';
  });

  /** Whether to show the retry button (only for 5xx errors). */
  protected readonly showRetry = computed(() => {
    const state = this.loadState();
    return state.status === 'error' && state.code >= 500;
  });

  /** The loaded replay data (available when status is 'success'). */
  protected readonly replayData = computed(() => {
    const state = this.loadState();
    return state.status === 'success' ? state.data : null;
  });

  /** The viewer's user ID. */
  protected readonly viewerUserId = computed(() => this.auth.user()?.userId ?? 0);

  /** Participants mapped to UserIdentity format for the table. */
  protected readonly replayParticipants = computed(() => {
    const data = this.replayData();
    if (!data) return [];
    return data.participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
    }));
  });

  protected readonly sidebarTab = signal<ReplaySidebarTab>('games');

  /** Reference to the sidebar for autoplay pause/resume. */
  private readonly sidebar = viewChild(ReplaySidebar);

  /** Whether autoplay was paused by the summary overlay (to resume on dismiss). */
  private autoplayPausedByOverlay = false;

  constructor() {
    // React to query param changes and load replay data
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const sessionParam = params.get('session');
      const parsed = this.parseSessionId(sessionParam);
      this.sessionId.set(parsed);
      this.sidebarTab.set(parsed !== null ? 'controls' : 'games');

      if (parsed !== null) {
        this.loadReplayData(parsed);
      } else {
        this.loadState.set({ status: 'idle' });
      }
    });

    // Watch for final position with score phase to auto-display summary
    effect(() => {
      const atFinal = this.isAtFinalScorePosition();
      const hasComponent = this.summaryComponent() !== null;

      if (atFinal && hasComponent) {
        this.scheduleSummaryDisplay();
      } else {
        this.hideSummaryOverlay();
      }
    });

    this.destroyRef.onDestroy(() => this.clearSummaryTimer());
  }

  /** Parse the session query parameter. Returns a valid positive integer or null. */
  private parseSessionId(value: string | null): number | null {
    if (value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) return null;
    return num;
  }

  /** Load replay data for the given session ID. */
  private loadReplayData(sessionId: number): void {
    this.loadState.set({ status: 'loading' });
    this.summaryData.set(null);
    this.summaryOverlayVisible.set(false);
    this.clearSummaryTimer();

    this.replayApi
      .getReplayData(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.loadState.set({ status: 'success', data });
          this.initializeEngine(data);
          this.fetchSummaryData(sessionId);
        },
        error: (err: HttpErrorResponse) => {
          const code = err.status ?? 500;
          let message: string;

          if (code === 403) {
            message = "You don't have access to this replay.";
          } else if (code === 404) {
            message = 'Replay not found.';
          } else {
            message = 'An error occurred while loading the replay. Please try again.';
          }

          this.loadState.set({ status: 'error', code, message });
        },
      });
  }

  /** Initialize the replay engine with loaded data. */
  private initializeEngine(data: ReplayDataResponse): void {
    const viewerUserId = this.auth.user()?.userId ?? 0;
    this.replayEngine.initialize(
      data.gameType,
      data.config,
      data.participants,
      data.events,
      viewerUserId,
    );
  }

  /** Retry loading the current session. */
  protected retry(): void {
    const id = this.sessionId();
    if (id !== null) {
      this.loadReplayData(id);
    }
  }

  /** Toggle the sidebar panel. */
  protected togglePanel(open: boolean): void {
    this.panelOpen.set(open);
    localStorage.setItem(ReplayPage.PANEL_KEY, open ? 'open' : 'closed');
  }

  /** Dismiss the summary overlay. Resumes autoplay if it was paused by the overlay. */
  protected dismissSummary(): void {
    this.summaryOverlayVisible.set(false);
    this.clearSummaryTimer();

    if (this.autoplayPausedByOverlay) {
      this.autoplayPausedByOverlay = false;
      this.sidebar()?.resumeAutoplay();
    }
  }

  /** Handle the "Summary" button click from replay controls. */
  protected onSummaryButtonClick(): void {
    // Pause autoplay if running
    this.autoplayPausedByOverlay = this.sidebar()?.pauseAutoplay() ?? false;
    this.summaryOverlayVisible.set(true);
  }

  /** Schedule showing the summary overlay after 500ms. */
  private scheduleSummaryDisplay(): void {
    // If already visible or timer already running, no-op
    if (this.summaryOverlayVisible() || this.summaryDelayTimer !== null) return;

    this.summaryDelayTimer = setTimeout(() => {
      this.summaryDelayTimer = null;
      this.summaryOverlayVisible.set(true);
    }, 500);
  }

  /** Hide the summary overlay and cancel any pending timer. */
  private hideSummaryOverlay(): void {
    this.clearSummaryTimer();
    this.summaryOverlayVisible.set(false);

    if (this.autoplayPausedByOverlay) {
      this.autoplayPausedByOverlay = false;
      this.sidebar()?.resumeAutoplay();
    }
  }

  /** Cancel the pending summary display timer. */
  private clearSummaryTimer(): void {
    if (this.summaryDelayTimer !== null) {
      clearTimeout(this.summaryDelayTimer);
      this.summaryDelayTimer = null;
    }
  }

  /** Fetch summary data (persisted store) for the session. */
  private fetchSummaryData(sessionId: number): void {
    this.summaryApi
      .getSummaryData(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.summaryData.set(data),
        error: () => {
          // Silently fail — summary is a non-critical enhancement
          this.summaryData.set(null);
        },
      });
  }
}
