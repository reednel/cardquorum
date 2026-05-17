import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  faBackwardFast,
  faBackwardStep,
  faForwardFast,
  faForwardStep,
  faPause,
  faPlay,
  faRepeat,
  faTableList,
} from '@fortawesome/free-solid-svg-icons';
import { ReplayEngineService } from './replay-engine.service';

@Component({
  selector: 'app-replay-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaIconComponent, FormsModule],
  template: `
    <div
      class="mb-3 min-h-10 rounded-default bg-surface-raised px-3 py-2 dark:bg-surface-raised-dark"
    >
      <p class="text-xs text-text-secondary dark:text-text-secondary-dark">
        {{ eventDescription() }}
      </p>
    </div>

    <p
      class="mb-3 text-center text-sm font-medium text-text-heading dark:text-white"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ positionDisplay() }}
    </p>

    <div
      class="mb-4 flex items-center justify-center gap-2"
      role="toolbar"
      aria-label="Replay navigation"
    >
      <button
        type="button"
        title="Jump to start (Home)"
        aria-label="Jump to start"
        [disabled]="backwardDisabled()"
        (click)="onJumpToStart()"
        [class]="navButtonClass(backwardDisabled())"
      >
        <fa-icon [icon]="faBackwardFast" aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Step backward (←)"
        aria-label="Step backward"
        [disabled]="backwardDisabled()"
        (click)="onStepBackward()"
        [class]="navButtonClass(backwardDisabled())"
      >
        <fa-icon [icon]="faBackwardStep" aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Step forward (→)"
        aria-label="Step forward"
        [disabled]="forwardDisabled()"
        (click)="onStepForward()"
        [class]="navButtonClass(forwardDisabled())"
      >
        <fa-icon [icon]="faForwardStep" aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Jump to end (End)"
        aria-label="Jump to end"
        [disabled]="forwardDisabled()"
        (click)="onJumpToEnd()"
        [class]="navButtonClass(forwardDisabled())"
      >
        <fa-icon [icon]="faForwardFast" aria-hidden="true" />
      </button>
    </div>

    <div class="flex flex-col gap-3 border-t border-border pt-3 dark:border-border-dark">
      <div class="flex items-center gap-2">
        <button
          type="button"
          [title]="autoplayRunning() ? 'Pause autoplay' : 'Start autoplay'"
          [attr.aria-label]="autoplayRunning() ? 'Pause autoplay' : 'Start autoplay'"
          [attr.aria-pressed]="autoplayRunning()"
          [disabled]="allDisabled()"
          (click)="toggleAutoplay()"
          [class]="
            'flex h-8 w-8 items-center justify-center rounded-default text-sm transition-colors ' +
            (allDisabled()
              ? 'cursor-not-allowed text-text-secondary/40 dark:text-text-secondary-dark/40'
              : autoplayRunning()
                ? 'bg-primary text-white hover:bg-primary-hover'
                : 'bg-surface-raised text-text-body hover:bg-primary/10 dark:bg-surface-raised-dark dark:text-text-heading-dark dark:hover:bg-primary/20')
          "
        >
          <fa-icon [icon]="autoplayRunning() ? faPause : faPlay" aria-hidden="true" />
        </button>

        <label
          class="flex items-center gap-1.5 text-xs text-text-secondary dark:text-text-secondary-dark"
        >
          <span>Speed:</span>
          <select
            [ngModel]="autoplaySpeed()"
            (ngModelChange)="onSpeedChange($event)"
            [disabled]="allDisabled()"
            class="rounded-default border border-border bg-surface px-2 py-1 text-xs
                   text-text-body dark:border-border-dark dark:bg-surface-dark
                   dark:text-text-heading-dark disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Autoplay speed"
          >
            <option [ngValue]="500">Fast (0.5s)</option>
            <option [ngValue]="1000">Normal (1s)</option>
            <option [ngValue]="2000">Slow (2s)</option>
          </select>
        </label>
      </div>

      <div
        class="flex items-center gap-2 text-xs text-text-secondary dark:text-text-secondary-dark"
      >
        <button
          type="button"
          role="switch"
          aria-label="Loop"
          [attr.aria-checked]="loopEnabled()"
          [disabled]="allDisabled()"
          (click)="toggleLoop()"
          [class]="
            'flex h-6 w-6 items-center justify-center rounded-default transition-colors ' +
            (allDisabled()
              ? 'cursor-not-allowed text-text-secondary/40 dark:text-text-secondary-dark/40'
              : loopEnabled()
                ? 'bg-primary text-white'
                : 'bg-surface-raised text-text-body dark:bg-surface-raised-dark dark:text-text-heading-dark')
          "
        >
          <fa-icon [icon]="faRepeat" class="text-xs" aria-hidden="true" />
        </button>
        <span>Loop</span>
      </div>
    </div>

    @if (summaryButtonVisible()) {
      <div class="mt-3 border-t border-border pt-3 dark:border-border-dark">
        <button
          type="button"
          aria-label="Summary"
          (click)="onSummaryClick()"
          class="flex w-full items-center justify-center gap-2 rounded-default bg-surface-raised
                 px-3 py-2 text-sm text-text-body transition-colors
                 hover:bg-primary/10 dark:bg-surface-raised-dark
                 dark:text-text-heading-dark dark:hover:bg-primary/20"
        >
          <fa-icon [icon]="faTableList" class="text-xs" aria-hidden="true" />
          <span>Summary</span>
        </button>
      </div>
    }
  `,
  host: {
    class: 'block',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ReplayControls {
  protected readonly faBackwardFast = faBackwardFast;
  protected readonly faBackwardStep = faBackwardStep;
  protected readonly faForwardFast = faForwardFast;
  protected readonly faForwardStep = faForwardStep;
  protected readonly faPlay = faPlay;
  protected readonly faPause = faPause;
  protected readonly faRepeat = faRepeat;
  protected readonly faTableList = faTableList;

  private readonly engine = inject(ReplayEngineService);
  private readonly destroyRef = inject(DestroyRef);

  /** Whether the "Summary" button should be visible. */
  readonly summaryButtonVisible = input(false);

  /** Emitted when the user clicks the "Summary" button. */
  readonly summaryRequested = output<void>();

  private static readonly SPEED_KEY = 'cq_replay_speed';
  private static readonly LOOP_KEY = 'cq_replay_loop';

  /** Autoplay state. */
  protected readonly autoplayRunning = signal(false);
  protected readonly autoplaySpeed = signal(this.loadSpeed());
  protected readonly loopEnabled = signal(this.loadLoop());

  private autoplayIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Whether backward/start actions are disabled. */
  protected readonly backwardDisabled = computed(
    () => this.engine.currentPosition() === 0 || this.engine.totalEvents() === 0,
  );

  /** Whether forward/end actions are disabled. */
  protected readonly forwardDisabled = computed(
    () =>
      this.engine.currentPosition() >= this.engine.totalEvents() || this.engine.totalEvents() === 0,
  );

  /** Whether all actions are disabled (zero events). */
  protected readonly allDisabled = computed(() => this.engine.totalEvents() === 0);

  /** Position display string: "N / M". */
  protected readonly positionDisplay = computed(
    () => `${this.engine.currentPosition()} / ${this.engine.totalEvents()}`,
  );

  /** Event description text. */
  protected readonly eventDescription = computed(
    () => this.engine.currentEventMessage() ?? 'Initial state',
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearAutoplayInterval();
    });
  }

  /** Navigation button class helper. */
  protected navButtonClass(disabled: boolean): string {
    return (
      'flex h-9 w-9 items-center justify-center rounded-default text-sm transition-colors ' +
      (disabled
        ? 'cursor-not-allowed text-text-secondary/40 dark:text-text-secondary-dark/40'
        : 'bg-surface-raised text-text-body hover:bg-primary/10 dark:bg-surface-raised-dark dark:text-text-heading-dark dark:hover:bg-primary/20')
    );
  }

  // ── Navigation actions ──

  protected onStepForward(): void {
    this.stopAutoplay();
    this.engine.stepForward();
  }

  protected onStepBackward(): void {
    this.stopAutoplay();
    this.engine.stepBackward();
  }

  protected onJumpToStart(): void {
    this.stopAutoplay();
    this.engine.jumpToStart();
  }

  protected onJumpToEnd(): void {
    this.stopAutoplay();
    this.engine.jumpToEnd();
  }

  // ── Autoplay ──

  protected toggleAutoplay(): void {
    if (this.autoplayRunning()) {
      this.stopAutoplay();
    } else {
      this.startAutoplay();
    }
  }

  protected onSpeedChange(speed: number): void {
    this.autoplaySpeed.set(speed);
    localStorage.setItem(ReplayControls.SPEED_KEY, String(speed));
    if (this.autoplayRunning()) {
      this.clearAutoplayInterval();
      this.startAutoplayInterval();
    }
  }

  protected toggleLoop(): void {
    this.loopEnabled.update((v) => {
      const next = !v;
      localStorage.setItem(ReplayControls.LOOP_KEY, String(next));
      return next;
    });
  }

  private startAutoplay(): void {
    if (this.allDisabled()) return;
    this.autoplayRunning.set(true);
    this.startAutoplayInterval();
  }

  private stopAutoplay(): void {
    this.autoplayRunning.set(false);
    this.clearAutoplayInterval();
  }

  private startAutoplayInterval(): void {
    this.autoplayIntervalId = setInterval(() => {
      this.autoplayTick();
    }, this.autoplaySpeed());
  }

  private clearAutoplayInterval(): void {
    if (this.autoplayIntervalId !== null) {
      clearInterval(this.autoplayIntervalId);
      this.autoplayIntervalId = null;
    }
  }

  private autoplayTick(): void {
    const pos = this.engine.currentPosition();
    const total = this.engine.totalEvents();

    if (pos >= total) {
      // At end
      if (this.loopEnabled()) {
        // Restart from beginning
        this.engine.jumpToStart();
      } else {
        // Stop autoplay
        this.stopAutoplay();
      }
    } else {
      this.engine.stepForward();
    }
  }

  // ── Keyboard shortcuts ──

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tagName = target?.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        if (!this.forwardDisabled()) {
          event.preventDefault();
          this.onStepForward();
        }
        break;
      case 'ArrowLeft':
        if (!this.backwardDisabled()) {
          event.preventDefault();
          this.onStepBackward();
        }
        break;
      case 'Home':
        if (!this.backwardDisabled()) {
          event.preventDefault();
          this.onJumpToStart();
        }
        break;
      case 'End':
        if (!this.forwardDisabled()) {
          event.preventDefault();
          this.onJumpToEnd();
        }
        break;
    }
  }

  private loadSpeed(): number {
    const stored = localStorage.getItem(ReplayControls.SPEED_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (parsed === 500 || parsed === 1000 || parsed === 2000) return parsed;
    return 1000;
  }

  private loadLoop(): boolean {
    return localStorage.getItem(ReplayControls.LOOP_KEY) === 'true';
  }

  // ── Summary ──

  protected onSummaryClick(): void {
    this.summaryRequested.emit();
  }

  /** Pause autoplay externally (e.g., when summary overlay is shown). Returns true if autoplay was running. */
  pauseAutoplay(): boolean {
    if (this.autoplayRunning()) {
      this.stopAutoplay();
      return true;
    }
    return false;
  }

  /** Resume autoplay externally (e.g., when summary overlay is dismissed). */
  resumeAutoplay(): void {
    this.startAutoplay();
  }
}
