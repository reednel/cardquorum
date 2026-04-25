import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardStack } from './card-stack';

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

  protected readonly cardBacks = computed(() => {
    const count = Math.min(this.handSize(), 10);
    return Array.from({ length: count }, () => null) as (string | null)[];
  });

  /** HSL color string for the player hue, or empty string when no hue. */
  protected readonly hueColor = computed(() => {
    const h = this.hue();
    if (h === null) return '';
    return `hsl(${h} 75% var(--card-halo-lightness))`;
  });
}
