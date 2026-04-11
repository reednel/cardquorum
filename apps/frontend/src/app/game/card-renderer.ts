import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-renderer',
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.aria-label]="alt()"
      role="img"
      class="select-none"
    >
      <use [attr.href]="svgHref()" />
    </svg>
  `,
  host: { class: 'inline-block' },
})
export class CardRenderer {
  /** Card name to display (e.g., 'qc', 'ad'). Null renders the card back. */
  readonly cardName = input<string | null>(null);
  /** Accessible alt text. */
  readonly alt = input('Card');
  /** SVG width in px. */
  readonly width = input(72);
  /** SVG height in px. */
  readonly height = input(100);

  protected readonly svgHref = computed(() => `cards/${this.cardName() ?? 'back'}.svg#icon`);
}
