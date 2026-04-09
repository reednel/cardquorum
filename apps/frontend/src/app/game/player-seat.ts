import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardImage } from './card-image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-player-seat',
  imports: [CardImage],
  template: `
    <div
      [class]="
        'flex flex-col items-center gap-1 ' +
        (isActive() ? 'ring-2 ring-indigo-400 rounded-lg p-1' : 'p-1')
      "
    >
      <!-- Card backs fan -->
      <div class="flex -space-x-4">
        @for (i of cardBackIndices(); track i) {
          <app-card-image [cardName]="null" alt="Card back" [width]="40" [height]="56" />
        }
      </div>

      <!-- Player name + dealer chip -->
      <div class="flex items-center gap-1">
        @if (isDealer()) {
          <span
            class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500
                   text-[10px] font-bold text-white"
            title="Dealer"
            aria-label="Dealer"
          >
            D
          </span>
        }
        <span
          class="max-w-[80px] truncate text-xs font-medium text-gray-700 dark:text-gray-300"
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

  protected readonly cardBackIndices = computed(() => {
    const count = Math.min(this.handSize(), 8);
    return Array.from({ length: count }, (_, i) => i);
  });
}
