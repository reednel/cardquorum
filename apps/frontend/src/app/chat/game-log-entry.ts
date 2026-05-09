import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GameLogBroadcast } from '@cardquorum/shared';
import { FormatTimePipe } from './format-time.pipe';

@Component({
  selector: 'app-game-log-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatTimePipe],
  template: `
    <div class="flex items-baseline text-xs text-text-secondary dark:text-text-secondary-dark">
      <span data-testid="game-log-message">{{ entry().message }}</span>
      <span data-testid="game-log-timestamp" class="ml-auto">{{
        entry().timestamp | formatTime
      }}</span>
    </div>
  `,
})
export class GameLogEntryComponent {
  entry = input.required<GameLogBroadcast>();
}
