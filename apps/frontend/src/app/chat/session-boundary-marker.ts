import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameLogBroadcast } from '@cardquorum/shared';

@Component({
  selector: 'app-session-boundary-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { role: 'separator' },
  template: `
    <div class="flex items-center justify-center gap-2 py-2">
      <span
        data-testid="session-boundary-text"
        class="text-sm font-semibold text-text-secondary dark:text-text-secondary-dark"
      >
        {{ entry().message }}
      </span>
      @if (showReplayLink()) {
        <a
          [routerLink]="['/replay']"
          [queryParams]="{ session: entry().sessionId }"
          aria-label="Watch replay for this game session"
          class="text-sm text-primary hover:text-primary-hover dark:text-primary-dark-text"
        >
          Replay
        </a>
      }
    </div>
  `,
})
export class SessionBoundaryMarker {
  entry = input.required<GameLogBroadcast>();

  showReplayLink = computed(() => {
    const eventType = this.entry().eventType;
    return eventType === 'game_finished' || eventType === 'game_abandoned';
  });
}
