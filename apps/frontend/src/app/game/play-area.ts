import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TrickPlayView } from '@cardquorum/shared';
import { CardRenderer } from './card-renderer';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-play-area',
  imports: [CardRenderer],
  template: `
    @if (plays(); as trickPlays) {
      <div class="relative h-40 w-56">
        @for (play of trickPlays; track play.userID) {
          <div
            class="absolute left-1/2 top-1/2 transition-all duration-300"
            [style.transform]="playTransform($index, trickPlays.length)"
          >
            <app-card-renderer [cardName]="play.cardName" [width]="60" [height]="84" />
          </div>
        }
      </div>
    }
  `,
})
export class PlayArea {
  /** Current trick plays from the plugin. */
  readonly plays = input<TrickPlayView[] | null>(null);

  /**
   * Offset each played card slightly from center based on play order.
   * Creates a loose cluster effect.
   */
  protected playTransform(index: number, total: number): string {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
    const radius = 30;
    const x = Math.cos(angle) * radius - 30; // offset for card width
    const y = Math.sin(angle) * radius - 42; // offset for card height
    return `translate(${x}px, ${y}px)`;
  }
}
