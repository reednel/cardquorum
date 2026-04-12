import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardRenderer } from './card-renderer';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-player-seat',
  imports: [CardRenderer],
  template: `
    <div
      [class]="
        'flex flex-col items-center gap-1 ' +
        (isActive() ? 'ring-2 ring-primary-light rounded-lg p-1' : 'p-1')
      "
    >
      <!-- Card backs fan -->
      <div class="flex -space-x-4">
        @for (i of cardBackIndices(); track i) {
          <app-card-renderer [cardName]="null" alt="Card back" [width]="40" [height]="56" />
        }
      </div>

      <!-- Player name + dealer chip -->
      <div class="flex items-center gap-1">
        @if (isDealer()) {
          <span
            class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent-dealer
                   text-[10px] font-bold text-white"
            title="Dealer"
            aria-label="Dealer"
          >
            D
          </span>
        }
        <span
          class="max-w-[80px] truncate text-xs font-medium text-text-body dark:text-text-body-dark"
          [title]="displayName()"
          [style.border-bottom]="seatBorderStyle()"
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

  protected readonly cardBackIndices = computed(() => {
    const count = Math.min(this.handSize(), 8);
    return Array.from({ length: count }, (_, i) => i);
  });

  /** CSS border-bottom for the seat color indicator, or empty string when no hue. */
  protected readonly seatBorderStyle = computed(() => {
    const h = this.hue();
    if (h === null) return '';
    const lightness = document.documentElement.classList.contains('dark') ? 33 : 66;
    return `2px solid hsl(${h}, 75%, ${lightness}%)`;
  });
}
