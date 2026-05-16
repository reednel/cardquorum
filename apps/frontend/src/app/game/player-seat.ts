import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { hueToHsl, SeatBadge } from '@cardquorum/shared';
import { ThemeService } from '../shell/theme.service';
import { CardStack } from './card-stack';

const SEAT_BADGE_CLASSES: Record<string, string> = {
  red: 'bg-badge-red text-white dark:bg-badge-red-light dark:text-gray-900',
  yellow: 'bg-badge-yellow text-white dark:bg-badge-yellow-light dark:text-gray-900',
  green: 'bg-badge-green text-white dark:bg-badge-green-light dark:text-gray-900',
  blue: 'bg-badge-blue text-white dark:bg-badge-blue-light dark:text-gray-900',
  purple: 'bg-badge-purple text-white dark:bg-badge-purple-light dark:text-gray-900',
  pink: 'bg-badge-pink text-white dark:bg-badge-pink-light dark:text-gray-900',
  dark: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-player-seat',
  imports: [CardStack],
  styles: `
    .seat-pill {
      background-clip: padding-box;
    }
    .seat-pill-active {
      animation: seat-pulse 1.8s ease-in-out infinite;
    }
    @keyframes seat-pulse {
      0%,
      100% {
        border-color: var(--seat-hue-color);
      }
      50% {
        border-color: transparent;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .seat-pill-active {
        animation: none;
        border-color: var(--seat-hue-color);
      }
    }
  `,
  template: `
    <div class="flex flex-col items-center gap-1 p-1">
      <!-- Card backs fan -->
      <app-card-stack [cards]="cardBacks()" [spread]="0.25" [cardWidth]="40" [spreadAngle]="0" />

      <!-- Badge row + name pill -->
      <div class="inline-flex items-center gap-1">
        <!-- Left badges -->
        @if (leftBadges().length > 0) {
          <div role="group" aria-label="Player badges" class="flex items-center gap-0.5">
            @for (badge of leftBadges(); track badge.label) {
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

        <!-- Player name pill -->
        <div
          [class]="
            'seat-pill inline-flex items-center rounded-full border-2 border-transparent px-2.5 py-0.5 transition-[border-color] duration-200 ease-in-out bg-surface-raised dark:bg-surface-raised-dark' +
            (isActive() ? ' seat-pill-active' : '')
          "
          [style.border-color]="!isActive() && hue() !== null ? hueColor() : null"
          [style.--seat-hue-color]="hueColor()"
        >
          <span
            class="truncate max-w-20 text-xs font-medium text-text-heading dark:text-text-heading-dark"
            [title]="displayName()"
          >
            {{ displayName() }}
          </span>
        </div>

        <!-- Right badges -->
        @if (rightBadges().length > 0) {
          <div role="group" aria-label="Player badges" class="flex items-center gap-0.5">
            @for (badge of rightBadges(); track badge.label) {
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
    </div>
  `,
  host: { class: 'absolute' },
})
export class PlayerSeat {
  readonly displayName = input.required<string>();
  readonly handSize = input(0);
  readonly isDealer = input(false);
  readonly isActive = input(false);
  readonly hue = input<number | null>(null);
  readonly badges = input<SeatBadge[]>([]);

  private readonly themeService = inject(ThemeService);

  protected readonly leftBadges = computed(() =>
    this.badges().filter((b) => b.position === 'left'),
  );

  protected readonly rightBadges = computed(() =>
    this.badges().filter((b) => b.position === 'right'),
  );

  protected readonly cardBacks = computed(() => {
    const count = Math.min(this.handSize(), 10);
    return Array.from({ length: count }, () => null) as (string | null)[];
  });

  /** HSL color string for the player hue, or empty string when no hue. */
  protected readonly hueColor = computed(() => {
    const h = this.hue();
    if (h === null) return '';
    return hueToHsl(h, this.themeService.darkMode() ? 'dark' : 'light');
  });

  protected badgeClass(color: string): string {
    return SEAT_BADGE_CLASSES[color] ?? '';
  }
}
