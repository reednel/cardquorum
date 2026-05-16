import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  ColorAssignmentMap,
  GameTablePlugin,
  SeatBadge,
  SeatInfo,
  StatusBarConfig,
  UserIdentity,
} from '@cardquorum/shared';
import { GameStatusBar } from './game-status-bar';
import { PlayerSeat } from './player-seat';

const SEAT_BADGE_CLASSES: Record<string, string> = {
  red: 'bg-badge-red-surface text-badge-red dark:bg-badge-red-surface-dark dark:text-badge-red-dark',
  yellow:
    'bg-badge-yellow-surface text-badge-yellow dark:bg-badge-yellow-surface-dark dark:text-badge-yellow-dark',
  green:
    'bg-badge-green-surface text-badge-green dark:bg-badge-green-surface-dark dark:text-badge-green-dark',
  blue: 'bg-badge-blue-surface text-badge-blue dark:bg-badge-blue-surface-dark dark:text-badge-blue-dark',
  purple:
    'bg-badge-purple-surface text-badge-purple dark:bg-badge-purple-surface-dark dark:text-badge-purple-dark',
  pink: 'bg-badge-pink-surface text-badge-pink dark:bg-badge-pink-surface-dark dark:text-badge-pink-dark',
  dark: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-table-shell',
  imports: [PlayerSeat, GameStatusBar],
  template: `
    <div class="flex h-full flex-col">
      <app-game-status-bar [config]="statusInfo()" />

      <!-- Table surface -->
      <div class="relative flex-1 overflow-hidden bg-game-felt dark:bg-game-felt-dark">
        <!-- Opponent seats around the arc -->
        @for (seat of seatsWithPosition(); track seat.userID) {
          <app-player-seat
            [displayName]="userDisplayName(seat.userID)"
            [handSize]="seat.handSize"
            [isDealer]="seat.isDealer"
            [isActive]="seat.isActive"
            [hue]="colorMap()?.[seat.userID] ?? null"
            [badges]="seat.badges"
            [style.left.%]="seat.x"
            [style.top.%]="seat.y"
            class="-translate-x-1/2 -translate-y-1/2"
          />
        }

        <!-- Center play area -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ng-content select="[playArea]" />
        </div>

        <!-- Local player hand + badges -->
        <div class="absolute bottom-2 left-0 flex w-full flex-col items-center gap-1">
          <ng-content select="[hand]" />
          @if (localPlayerBadges().length > 0) {
            <div role="group" aria-label="Player badges" class="flex items-center gap-0.5">
              @for (badge of localPlayerBadges(); track badge.label) {
                <span
                  [class]="
                    'flex h-5 w-5 select-none items-center justify-center rounded-full text-[10px] font-bold ' +
                    badgeClass(badge.color)
                  "
                  [attr.aria-label]="badge.description"
                  [title]="badge.description"
                  >{{ badge.label }}</span
                >
              }
            </div>
          }
        </div>

        <!-- Corner actions -->
        <div class="absolute bottom-16 right-4 z-10">
          <ng-content select="[cornerActions]" />
        </div>

        <!-- Overlay host -->
        <ng-content select="[overlay]" />
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
  readonly colorMap = input<ColorAssignmentMap | undefined>(undefined);
  readonly config = input<unknown>(null);

  /**
   * Accumulates member identities so that players who leave mid-game
   * still have their display names resolved on the table.
   */
  private readonly memberCache = new Map<number, UserIdentity>();

  private readonly knownMembers = computed<Map<number, UserIdentity>>(() => {
    for (const m of this.members()) {
      this.memberCache.set(m.userId, m);
    }
    return this.memberCache;
  });

  protected readonly seats = computed<SeatInfo[]>(() =>
    this.plugin().getPlayerSeats(this.state(), this.myUserID()),
  );

  protected readonly statusInfo = computed<StatusBarConfig>(() =>
    this.plugin().getStatusInfo(this.state(), this.myUserID(), this.config()),
  );

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
    const member = this.knownMembers().get(userID);
    return member?.displayName ?? member?.username ?? `Player ${userID}`;
  }

  protected readonly localPlayerBadges = computed<SeatBadge[]>(() => {
    const plugin = this.plugin();
    if (!plugin.getSeatBadges) return [];
    return plugin.getSeatBadges(this.state(), this.myUserID());
  });

  protected badgeClass(color: string): string {
    return SEAT_BADGE_CLASSES[color] ?? '';
  }
}
