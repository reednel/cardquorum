import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomStatsPlayerDto, StatsQueryParams } from '@cardquorum/shared';
import { GameService } from '../game/game.service';
import { StatsService } from '../stats/stats.service';

type TimeRange = StatsQueryParams['timeRange'];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-stats-tab',
  template: `
    <div class="flex flex-col gap-3 overflow-y-auto p-3">
      <!-- Filters -->
      <div class="flex gap-2">
        <select
          [value]="timeRange()"
          (change)="onTimeRangeChange($event)"
          aria-label="Time range filter"
          class="rounded-default border border-border bg-surface px-2 py-1 text-xs text-text-body
                 dark:border-border-dark dark:bg-surface-dark dark:text-text-body-dark"
        >
          <option value="all">All Time</option>
          <option value="day">Past Day</option>
          <option value="week">Past Week</option>
          <option value="month">Past Month</option>
          <option value="year">Past Year</option>
        </select>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <p class="text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          Loading stats…
        </p>
      }

      <!-- Error -->
      @if (error()) {
        <div class="text-center text-sm text-red-500">
          <p>Could not load stats.</p>
          <button
            (click)="loadStats()"
            class="mt-1 text-xs text-primary underline hover:text-primary-dark"
          >
            Retry
          </button>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && !error() && players().length === 0) {
        <p class="text-center text-sm text-text-secondary dark:text-text-secondary-dark">
          No stats available yet.
        </p>
      }

      <!-- Stats table -->
      @if (!loading() && !error() && players().length > 0) {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr
                class="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark"
              >
                <th class="pb-1 font-medium">Player</th>
                <th class="pb-1 font-medium">Wins</th>
                <th class="pb-1 font-medium">Losses</th>
                <th class="pb-1 font-medium">Score</th>
                <th class="pb-1 font-medium">Games</th>
              </tr>
            </thead>
            <tbody>
              @for (player of players(); track player.userId) {
                <tr class="border-b border-border/50 dark:border-border-dark/50">
                  <td class="py-1 text-text-body dark:text-text-body-dark">
                    {{ player.displayName }}
                  </td>
                  <td class="py-1">{{ player.wins }} ({{ winPct(player) }}%)</td>
                  <td class="py-1">{{ player.losses }} ({{ lossPct(player) }}%)</td>
                  <td class="py-1">{{ player.score }}</td>
                  <td class="py-1">{{ player.gamesPlayed }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class RoomStatsTab {
  readonly roomId = input.required<number>();

  private readonly statsService = inject(StatsService);
  private readonly gameService = inject(GameService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly players = signal<RoomStatsPlayerDto[]>([]);
  protected readonly timeRange = signal<TimeRange>(this.loadTimeRange());

  constructor() {
    effect(() => {
      // Reload when roomId changes
      this.roomId();
      this.loadStats();
    });

    // Re-fetch stats when a game finishes (store becomes non-null)
    effect(() => {
      const store = this.gameService.store();
      if (store !== null) {
        this.loadStats();
      }
    });
  }

  loadStats(): void {
    const roomId = this.roomId();
    if (!roomId) return;

    this.loading.set(true);
    this.error.set(false);

    const params: StatsQueryParams = {
      timeRange: this.timeRange() ?? 'all',
    };

    this.statsService
      .getRoomStats(roomId, params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.players.set(res.players);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  protected onTimeRangeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TimeRange;
    this.timeRange.set(value);
    localStorage.setItem('cq_room_stats_time_range', value ?? 'all');
    this.loadStats();
  }

  protected winPct(player: RoomStatsPlayerDto): number {
    if (player.gamesPlayed === 0) return 0;
    return Math.round((player.wins / player.gamesPlayed) * 100);
  }

  protected lossPct(player: RoomStatsPlayerDto): number {
    if (player.gamesPlayed === 0) return 0;
    return Math.round((player.losses / player.gamesPlayed) * 100);
  }

  private loadTimeRange(): TimeRange {
    const stored = localStorage.getItem('cq_room_stats_time_range');
    if (
      stored === 'all' ||
      stored === 'day' ||
      stored === 'week' ||
      stored === 'month' ||
      stored === 'year'
    ) {
      return stored;
    }
    return 'all';
  }
}
