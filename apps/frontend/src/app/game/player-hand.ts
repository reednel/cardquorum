import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CardImage } from './card-image';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-player-hand',
  imports: [CardImage],
  template: `
    <div class="flex justify-center -space-x-3">
      @for (card of cards(); track card) {
        <button
          type="button"
          [disabled]="!isLegal(card)"
          [class]="
            'relative transition-transform duration-100 focus:outline-none focus:ring-2 ' +
            'focus:ring-indigo-400 rounded-lg ' +
            (isLegal(card)
              ? 'cursor-pointer hover:-translate-y-2'
              : 'opacity-40 cursor-not-allowed') +
            (selectedCard() === card ? ' -translate-y-3 ring-2 ring-indigo-500' : '')
          "
          [attr.aria-label]="cardAlt(card)"
          (click)="onCardClick(card)"
          (dblclick)="onCardDoubleClick(card)"
        >
          <app-card-image [cardName]="card" [alt]="cardAlt(card)" [width]="72" [height]="100" />
        </button>
      }
    </div>
  `,
})
export class PlayerHand {
  /** Card names in the player's hand. */
  readonly cards = input.required<string[]>();
  /** Card names that are legal to play. */
  readonly legalCards = input.required<string[]>();
  /** Emitted when a card is confirmed to play. */
  readonly cardPlayed = output<string>();

  protected readonly selectedCard = signal<string | null>(null);

  private readonly legalSet = computed(() => new Set(this.legalCards()));

  protected isLegal(cardName: string): boolean {
    return this.legalSet().has(cardName);
  }

  protected cardAlt(cardName: string): string {
    return cardName;
  }

  protected onCardClick(cardName: string): void {
    if (!this.isLegal(cardName)) return;
    if (this.selectedCard() === cardName) {
      // Second click on selected card — confirm play
      this.selectedCard.set(null);
      this.cardPlayed.emit(cardName);
    } else {
      this.selectedCard.set(cardName);
    }
  }

  protected onCardDoubleClick(cardName: string): void {
    if (!this.isLegal(cardName)) return;
    this.selectedCard.set(null);
    this.cardPlayed.emit(cardName);
  }
}
