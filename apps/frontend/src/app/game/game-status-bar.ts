import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StatusInfo } from '@cardquorum/shared';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-status-bar',
  template: `
    <div
      class="flex items-center justify-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-1.5
             text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
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
