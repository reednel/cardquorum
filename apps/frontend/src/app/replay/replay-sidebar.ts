import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGamepad, faList } from '@fortawesome/free-solid-svg-icons';
import { GameSelectionPanel } from './game-selection-panel';
import { ReplayControls } from './replay-controls';

export type ReplaySidebarTab = 'games' | 'controls';

@Component({
  selector: 'app-replay-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaIconComponent, GameSelectionPanel, ReplayControls],
  template: `
    <div class="flex border-b border-border dark:border-border-dark">
      <nav class="flex flex-1" role="tablist" aria-label="Replay panels">
        <button
          role="tab"
          [attr.aria-selected]="tab() === 'games'"
          aria-controls="games-panel"
          title="Games"
          [class]="
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors ' +
            (tab() === 'games'
              ? 'border-b-2 border-primary-dark text-primary dark:text-primary-dark-text'
              : 'text-text-secondary hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark')
          "
          (click)="onTabClick('games')"
        >
          <fa-icon [icon]="faList" aria-hidden="true" />
          <span class="text-xs">Games</span>
        </button>
        <button
          role="tab"
          [attr.aria-selected]="tab() === 'controls'"
          aria-controls="controls-panel"
          title="Controls"
          [class]="
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors ' +
            (tab() === 'controls'
              ? 'border-b-2 border-primary-dark text-primary dark:text-primary-dark-text'
              : 'text-text-secondary hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark')
          "
          (click)="onTabClick('controls')"
        >
          <fa-icon [icon]="faGamepad" aria-hidden="true" />
          <span class="text-xs">Controls</span>
        </button>
      </nav>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      @switch (tab()) {
        @case ('games') {
          <div
            id="games-panel"
            role="tabpanel"
            aria-labelledby="games-tab"
            class="flex min-h-0 flex-1 flex-col p-3"
          >
            <app-game-selection-panel />
          </div>
        }
        @case ('controls') {
          <div
            id="controls-panel"
            role="tabpanel"
            aria-labelledby="controls-tab"
            class="flex min-h-0 flex-1 flex-col p-3"
          >
            <app-replay-controls
              [summaryButtonVisible]="summaryButtonVisible()"
              (summaryRequested)="summaryRequested.emit()"
            />
          </div>
        }
      }
    </div>
  `,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class ReplaySidebar {
  readonly tab = input<ReplaySidebarTab>('games');

  /** Whether the "Summary" button should be visible in the controls. */
  readonly summaryButtonVisible = input(false);

  readonly tabChange = output<ReplaySidebarTab>();

  /** Emitted when the user clicks the "Summary" button in the controls. */
  readonly summaryRequested = output<void>();

  private readonly replayControls = viewChild(ReplayControls);

  protected readonly faList = faList;
  protected readonly faGamepad = faGamepad;

  protected onTabClick(tab: ReplaySidebarTab): void {
    this.tabChange.emit(tab);
  }

  /** Pause autoplay in the controls. Returns true if autoplay was running. */
  pauseAutoplay(): boolean {
    return this.replayControls()?.pauseAutoplay() ?? false;
  }

  /** Resume autoplay in the controls. */
  resumeAutoplay(): void {
    this.replayControls()?.resumeAutoplay();
  }
}
