import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GameTablePlugin, SeatInfo, StatusInfo, UserIdentity } from '@cardquorum/shared';
import { GameStatusBar } from './game-status-bar';
import { PlayerSeat } from './player-seat';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-table-shell',
  imports: [PlayerSeat, GameStatusBar],
  template: `
    <div class="flex h-full flex-col">
      <app-game-status-bar [status]="statusInfo()" />

      <!-- Table surface -->
      <div class="relative flex-1 overflow-hidden bg-game-felt">
        <!-- Opponent seats around the arc -->
        @for (seat of seatsWithPosition(); track seat.userID) {
          <app-player-seat
            [displayName]="userDisplayName(seat.userID)"
            [handSize]="seat.handSize"
            [isDealer]="seat.isDealer"
            [isActive]="seat.isActive"
            [style.left.%]="seat.x"
            [style.top.%]="seat.y"
            class="-translate-x-1/2 -translate-y-1/2"
          />
        }

        <!-- Center play area -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ng-content select="[playArea]" />
        </div>

        <!-- Overlay host -->
        <ng-content select="[overlay]" />
      </div>

      <!-- Local player hand -->
      <div
        [class]="
          'border-t border-border bg-surface-raised px-4 py-3 dark:border-border-dark dark:bg-surface-dark ' +
          (isMyTurn() ? 'ring-2 ring-inset ring-primary-light' : '')
        "
      >
        <ng-content select="[hand]" />
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
})
export class GameTableShell {
  readonly plugin = input.required<GameTablePlugin>();
  readonly state = input.required<unknown>();
  readonly validActions = input.required<string[]>();
  readonly myUserID = input.required<number>();
  readonly members = input.required<UserIdentity[]>();

  protected readonly seats = computed<SeatInfo[]>(() =>
    this.plugin().getPlayerSeats(this.state(), this.myUserID()),
  );

  protected readonly statusInfo = computed<StatusInfo>(() =>
    this.plugin().getStatusInfo(this.state()),
  );

  protected readonly isMyTurn = computed(() => {
    const actions = this.validActions();
    return actions.includes('play_card');
  });

  /** Compute percentage positions around an arc for each opponent seat. */
  protected readonly seatsWithPosition = computed(() => {
    const seatList = this.seats();
    const n = seatList.length + 1; // total players including self
    return seatList.map((seat, i) => {
      // Distribute opponents from left (π) to right (0) across an arc
      const angle = (Math.PI * (i + 1)) / n;
      // Map to percentage coordinates (center is 50%, radius ~40%)
      const x = 50 - 40 * Math.cos(angle);
      const y = 50 - 35 * Math.sin(angle);
      return { ...seat, x, y };
    });
  });

  protected userDisplayName(userID: number): string {
    const member = this.members().find((m) => m.userId === userID);
    return member?.displayName ?? member?.username ?? `Player ${userID}`;
  }
}
