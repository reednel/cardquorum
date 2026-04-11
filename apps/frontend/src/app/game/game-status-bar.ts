import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StatusInfo } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-status-bar',
  template: `
    <div
      class="flex items-center justify-center gap-4 border-b border-border bg-surface px-4 py-1.5
             text-xs text-text-secondary dark:border-border-dark dark:bg-surface-dark dark:text-text-secondary-dark"
    >
      <span class="font-medium">{{ status().phaseLabel }}</span>
      @if (status().trickNumber > 0) {
        <span>Trick {{ status().trickNumber }} / {{ status().totalTricks }}</span>
      }
    </div>
  `,
})
export class GameStatusBar {
  readonly status = input.required<StatusInfo>();
}
