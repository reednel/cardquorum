import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
              ? 'border-b-2 border-primary-light text-primary dark:text-primary-light-text'
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
              ? 'border-b-2 border-primary-light text-primary dark:text-primary-light-text'
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
            <app-replay-controls />
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

  readonly tabChange = output<ReplaySidebarTab>();

  protected readonly faList = faList;
  protected readonly faGamepad = faGamepad;

  protected onTabClick(tab: ReplaySidebarTab): void {
    this.tabChange.emit(tab);
  }
}
