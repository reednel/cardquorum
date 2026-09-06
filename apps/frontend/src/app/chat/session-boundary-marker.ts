import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type Type,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faClapperboard, faTableList } from '@fortawesome/free-solid-svg-icons';
import { type GameLogBroadcast, type UserIdentity } from '@cardquorum/shared';
import { GAME_TABLE_PLUGINS } from '../game/game-registry';
import { GameSummaryShell } from '../game/game-summary-shell';
import { GameService } from '../game/game.service';
import { SummaryApiService } from '../game/summary-api.service';

@Component({
  selector: 'app-session-boundary-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FaIconComponent, GameSummaryShell],
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
          title="Replay"
          class="text-primary hover:text-primary-hover dark:text-primary-dark"
        >
          <fa-icon [icon]="faClapperboard" aria-hidden="true" />
        </a>
      }
      @if (showSummaryLink()) {
        <button
          data-testid="summary-link"
          (click)="openSummary()"
          aria-label="View game summary for this session"
          title="Summary"
          class="text-primary hover:text-primary-hover dark:text-primary-dark"
        >
          <fa-icon [icon]="faTableList" aria-hidden="true" />
        </button>
      }
    </div>

    @if (summaryLoading()) {
      <div
        data-testid="summary-loading"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="status"
        aria-label="Loading game summary"
      >
        <span class="text-sm text-white">Loading summary…</span>
      </div>
    }

    @if (summaryError()) {
      <div
        data-testid="summary-error"
        class="mt-1 text-center text-sm text-danger dark:text-danger-dark"
        role="alert"
      >
        {{ summaryError() }}
      </div>
    }

    @if (showSummaryOverlay()) {
      <app-game-summary-shell
        mode="standalone"
        [summaryComponent]="summaryComponent()!"
        [store]="summaryStore()!"
        [participants]="summaryParticipants()"
        (dismissed)="closeSummary()"
      />
    }
  `,
})
export class SessionBoundaryMarker {
  entry = input.required<GameLogBroadcast>();

  protected readonly faClapperboard = faClapperboard;
  protected readonly faTableList = faTableList;

  private readonly gameService = inject(GameService);
  private readonly summaryApiService = inject(SummaryApiService);

  readonly summaryLoading = signal(false);
  readonly summaryError = signal<string | null>(null);
  readonly summaryStore = signal<unknown>(null);
  readonly summaryParticipants = signal<UserIdentity[]>([]);
  readonly summaryComponent = signal<Type<unknown> | null>(null);

  readonly showSummaryOverlay = computed(
    () =>
      this.summaryStore() !== null && this.summaryComponent() !== null && !this.summaryLoading(),
  );

  showReplayLink = computed(() => {
    const eventType = this.entry().eventType;
    return eventType === 'game_finished' || eventType === 'game_abandoned';
  });

  showSummaryLink = computed(() => {
    if (!this.showReplayLink()) return false;
    const plugin = this.getPlugin();
    return plugin?.getSummaryComponent != null;
  });

  openSummary(): void {
    const plugin = this.getPlugin();
    if (!plugin?.getSummaryComponent) return;

    this.summaryLoading.set(true);
    this.summaryError.set(null);
    this.summaryStore.set(null);
    this.summaryParticipants.set([]);
    this.summaryComponent.set(plugin.getSummaryComponent());

    this.summaryApiService.getSummaryData(this.entry().sessionId).subscribe({
      next: (response) => {
        this.summaryStore.set(response.store);
        this.summaryParticipants.set(
          response.participants.map((p) => ({
            userId: p.userId,
            username: p.username,
            displayName: p.displayName,
          })),
        );
        this.summaryLoading.set(false);
      },
      error: () => {
        this.summaryLoading.set(false);
        this.summaryError.set('Could not load game summary.');
        this.summaryComponent.set(null);
      },
    });
  }

  closeSummary(): void {
    this.summaryStore.set(null);
    this.summaryParticipants.set([]);
    this.summaryComponent.set(null);
  }

  private getPlugin() {
    const gameType = this.gameService.gameType();
    if (gameType) {
      return GAME_TABLE_PLUGINS[gameType] ?? null;
    }
    // Fallback: check all registered plugins for one with getSummaryComponent
    for (const plugin of Object.values(GAME_TABLE_PLUGINS)) {
      if (plugin.getSummaryComponent) return plugin;
    }
    return null;
  }
}
