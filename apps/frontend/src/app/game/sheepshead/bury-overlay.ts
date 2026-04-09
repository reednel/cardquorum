import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CardImage } from '../card-image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bury-overlay',
  imports: [CardImage],
  template: `
    @if (canAct()) {
      <div class="flex flex-col items-center gap-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Bury {{ buryCount() }} card{{ buryCount() > 1 ? 's' : '' }}
        </h3>
        <div class="flex flex-wrap justify-center gap-2">
          @for (card of hand(); track card) {
            <button
              type="button"
              [class]="
                'rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ' +
                (isSelected(card) ? 'ring-2 ring-red-500 -translate-y-2' : 'hover:-translate-y-1')
              "
              (click)="toggleCard(card)"
              [attr.aria-pressed]="isSelected(card)"
              [attr.aria-label]="'Select ' + card + ' to bury'"
            >
              <app-card-image [cardName]="card" [width]="60" [height]="84" />
            </button>
          }
        </div>
        <button
          [disabled]="selected().length !== buryCount()"
          (click)="confirm()"
          class="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white
                 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500
                 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm Bury ({{ selected().length }}/{{ buryCount() }})
        </button>
      </div>
    } @else {
      <p class="text-sm text-gray-500 dark:text-gray-400">Waiting for bury...</p>
    }
  `,
})
export class BuryOverlay {
  readonly validActions = input.required<string[]>();
  /** Card names in the player's hand. */
  readonly hand = input.required<string[]>();
  /** How many cards to bury. */
  readonly buryCount = input.required<number>();
  /** Emits selected card names. Parent converts to full Card objects via plugin. */
  readonly buryConfirmed = output<string[]>();

  protected readonly selected = signal<string[]>([]);

  protected canAct(): boolean {
    return this.validActions().includes('bury');
  }

  protected isSelected(card: string): boolean {
    return this.selected().includes(card);
  }

  protected toggleCard(card: string): void {
    this.selected.update((list) => {
      if (list.includes(card)) {
        return list.filter((c) => c !== card);
      }
      if (list.length >= this.buryCount()) return list;
      return [...list, card];
    });
  }

  protected confirm(): void {
    this.buryConfirmed.emit(this.selected());
    this.selected.set([]);
  }
}
