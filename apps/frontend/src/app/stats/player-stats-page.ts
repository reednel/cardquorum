import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { finalize } from 'rxjs';
import { GameType, PlayerStatsResponse, StatsQueryParams } from '@cardquorum/shared';
import { StatsService } from './stats.service';

type TimeRange = 'all' | 'day' | 'week' | 'month' | 'year';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
}

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: 'all', label: 'All Time' },
  { value: 'day', label: 'Past Day' },
  { value: 'week', label: 'Past Week' },
  { value: 'month', label: 'Past Month' },
  { value: 'year', label: 'Past Year' },
];

const GAME_TYPE_LABELS: Record<GameType, string> = {
  sheepshead: 'Sheepshead',
};

const LS_GAME_TYPE_KEY = 'cq_player_stats_game_type';
const LS_TIME_RANGE_KEY = 'cq_player_stats_time_range';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-player-stats-page',
  template: `
    <div class="space-y-4">
      <!-- Filters -->
      <div data-testid="filters" class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
            Game
          </span>
          <select
            data-testid="game-type-filter"
            [value]="gameTypeFilter()"
            (change)="onGameTypeChange($any($event.target).value)"
            class="rounded-default border border-border-input px-3 py-1.5 text-sm text-text-heading
                     dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            aria-label="Filter by game type"
          >
            <option value="">All</option>
            @for (gt of gameTypes; track gt) {
              <option [value]="gt">{{ gameTypeLabel(gt) }}</option>
            }
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
            Time Range
          </span>
          <select
            data-testid="time-range-filter"
            [value]="timeRangeFilter()"
            (change)="onTimeRangeChange($any($event.target).value)"
            class="rounded-default border border-border-input px-3 py-1.5 text-sm text-text-heading
                     dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
            aria-label="Filter by time range"
          >
            @for (opt of timeRangeOptions; track opt.value) {
              <option [value]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </label>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <p
          data-testid="loading-state"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          Loading stats...
        </p>
      }

      <!-- Error state -->
      @if (error()) {
        <div data-testid="error-state" class="text-sm text-danger dark:text-danger-dark">
          <p>Could not retrieve stats.</p>
        </div>
      }

      <!-- Empty state: no games at all -->
      @if (!loading() && !error() && noGamesAtAll()) {
        <p
          data-testid="empty-state"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No stats available. Play some games to see your stats here.
        </p>
      }

      <!-- Empty state: no games matching filters -->
      @if (!loading() && !error() && noGamesMatchingFilters()) {
        <p
          data-testid="empty-filtered-state"
          class="text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No stats match the current filters.
        </p>
      }

      <!-- Stats table -->
      @if (!loading() && !error() && hasData()) {
        <div class="overflow-x-auto">
          <table
            data-testid="stats-table"
            class="w-full text-left text-sm"
            aria-label="Player statistics"
          >
            <thead>
              <tr
                class="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark"
              >
                <th class="px-3 py-2 font-medium">Game</th>
                <th class="px-3 py-2 font-medium">Wins</th>
                <th class="px-3 py-2 font-medium">Losses</th>
                <th class="px-3 py-2 font-medium">Score</th>
                <th class="px-3 py-2 font-medium">Games Played</th>
              </tr>
            </thead>
            <tbody>
              @for (row of tableRows(); track row.gameType) {
                <tr
                  [attr.data-testid]="'stats-row-' + row.gameType"
                  class="border-b border-border dark:border-border-dark"
                >
                  <td class="px-3 py-2 text-text-heading dark:text-text-heading-dark">
                    {{ row.gameTypeLabel }}
                  </td>
                  <td class="px-3 py-2 text-text-heading dark:text-text-heading-dark">
                    {{ row.wins }} ({{ row.winPct }}%)
                  </td>
                  <td class="px-3 py-2 text-text-heading dark:text-text-heading-dark">
                    {{ row.losses }} ({{ row.lossPct }}%)
                  </td>
                  <td class="px-3 py-2 text-text-heading dark:text-text-heading-dark">
                    {{ row.score }}
                  </td>
                  <td class="px-3 py-2 text-text-heading dark:text-text-heading-dark">
                    {{ row.gamesPlayed }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PlayerStatsPage {
  private readonly statsService = inject(StatsService);

  protected readonly timeRangeOptions = TIME_RANGE_OPTIONS;
  protected readonly gameTypes: GameType[] = ['sheepshead'];

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly data = signal<PlayerStatsResponse | null>(null);

  protected readonly gameTypeFilter = signal<GameType | ''>(this.loadGameTypeFilter());
  protected readonly timeRangeFilter = signal<TimeRange>(this.loadTimeRangeFilter());

  /** True when the user has zero games overall (no filters applied would help). */
  protected readonly noGamesAtAll = computed(() => {
    const d = this.data();
    if (!d) return false;
    return d.gamesPlayed === 0 && this.gameTypeFilter() === '' && this.timeRangeFilter() === 'all';
  });

  /** True when filters are active and no data matches, but user has games in other categories. */
  protected readonly noGamesMatchingFilters = computed(() => {
    const d = this.data();
    if (!d) return false;
    if (d.gamesPlayed > 0) return false;
    // Only show this if filters are active (otherwise it's the "no games at all" state)
    return this.gameTypeFilter() !== '' || this.timeRangeFilter() !== 'all';
  });

  protected readonly hasData = computed(() => {
    const d = this.data();
    return d !== null && d.gamesPlayed > 0;
  });

  protected readonly tableRows = computed(() => {
    const d = this.data();
    if (!d || d.gamesPlayed === 0) return [];

    // If a specific game type is filtered, show a single row
    if (this.gameTypeFilter()) {
      return [this.buildRow(this.gameTypeFilter() as GameType, d)];
    }

    // Otherwise, show breakdown by game type if available
    if (d.breakdown) {
      const rows: ReturnType<typeof this.buildRow>[] = [];
      for (const gt of this.gameTypes) {
        const entry = d.breakdown[gt];
        if (entry && entry.gamesPlayed > 0) {
          rows.push(this.buildRow(gt, entry));
        }
      }
      return rows;
    }

    // Fallback: single "All" row
    return [this.buildRow('all' as GameType, d)];
  });

  private readonly filterEffect = effect(() => {
    // Track signal reads to trigger re-fetch
    this.gameTypeFilter();
    this.timeRangeFilter();
    this.fetchStats();
  });

  protected onGameTypeChange(value: string): void {
    const gt = value as GameType | '';
    this.gameTypeFilter.set(gt);
    localStorage.setItem(LS_GAME_TYPE_KEY, gt);
  }

  protected onTimeRangeChange(value: string): void {
    const tr = value as TimeRange;
    this.timeRangeFilter.set(tr);
    localStorage.setItem(LS_TIME_RANGE_KEY, tr);
  }

  protected gameTypeLabel(gt: GameType | string): string {
    if (gt === 'all') return 'All';
    return GAME_TYPE_LABELS[gt as GameType] ?? gt;
  }

  private buildRow(
    gameType: GameType | string,
    stats: { wins: number; losses: number; score: number; gamesPlayed: number },
  ) {
    const winPct = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
    const lossPct =
      stats.gamesPlayed > 0 ? Math.round((stats.losses / stats.gamesPlayed) * 100) : 0;

    return {
      gameType,
      gameTypeLabel: this.gameTypeLabel(gameType),
      wins: stats.wins,
      losses: stats.losses,
      score: stats.score,
      gamesPlayed: stats.gamesPlayed,
      winPct,
      lossPct,
    };
  }

  private fetchStats(): void {
    this.loading.set(true);
    this.error.set(false);

    const params: StatsQueryParams = {};
    const gt = this.gameTypeFilter();
    if (gt) {
      params.gameType = gt;
    }
    const tr = this.timeRangeFilter();
    if (tr !== 'all') {
      params.timeRange = tr;
    }

    this.statsService
      .getPlayerStats(params)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.data.set(response),
        error: () => this.error.set(true),
      });
  }

  private loadGameTypeFilter(): GameType | '' {
    const stored = localStorage.getItem(LS_GAME_TYPE_KEY);
    if (stored && this.gameTypes.includes(stored as GameType)) {
      return stored as GameType;
    }
    return '';
  }

  private loadTimeRangeFilter(): TimeRange {
    const stored = localStorage.getItem(LS_TIME_RANGE_KEY);
    const validRanges: TimeRange[] = ['all', 'day', 'week', 'month', 'year'];
    if (stored && validRanges.includes(stored as TimeRange)) {
      return stored as TimeRange;
    }
    return 'all';
  }
}
