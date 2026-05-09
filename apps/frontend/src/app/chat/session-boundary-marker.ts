import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GameLogBroadcast } from '@cardquorum/shared';

@Component({
  selector: 'app-session-boundary-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'separator' },
  template: `
    <div class="flex items-center gap-2 py-2">
      <hr class="flex-1 border-border dark:border-border-dark" aria-hidden="true" />
      <span
        data-testid="session-boundary-text"
        class="text-sm font-semibold text-text-secondary dark:text-text-secondary-dark"
      >
        {{ entry().message }}
      </span>
      <hr class="flex-1 border-border dark:border-border-dark" aria-hidden="true" />
    </div>
  `,
})
export class SessionBoundaryMarker {
  entry = input.required<GameLogBroadcast>();
}
