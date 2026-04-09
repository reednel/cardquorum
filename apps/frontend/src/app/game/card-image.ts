import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-image',
  imports: [NgOptimizedImage],
  template: `
    <img
      [ngSrc]="'cards/' + (cardName() ?? 'back') + '.svg'"
      [alt]="alt()"
      [width]="width()"
      [height]="height()"
      class="select-none"
    />
  `,
  host: { class: 'inline-block' },
})
export class CardImage {
  /** Card name to display (e.g., 'qc', 'ad'). Null renders the card back. */
  readonly cardName = input<string | null>(null);
  /** Accessible alt text. */
  readonly alt = input('Card');
  /** Image width in px (for NgOptimizedImage). */
  readonly width = input(72);
  /** Image height in px (for NgOptimizedImage). */
  readonly height = input(100);
}
