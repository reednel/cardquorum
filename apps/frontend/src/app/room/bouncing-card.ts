import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
  type ElementRef,
  type OnDestroy,
} from '@angular/core';
import { CardRenderer } from '../game/card-renderer';

/** Standard 52-card deck names (rank + suit). */
const DECK: string[] = (() => {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'x', 'j', 'q', 'k', 'a'];
  const suits = ['c', 'd', 'h', 's'];
  return ranks.flatMap((r) => suits.map((s) => r + s));
})();

function randomCard(exclude?: string): string {
  let card: string;
  do {
    card = DECK[Math.floor(Math.random() * DECK.length)];
  } while (card === exclude);
  return card;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bouncing-card',
  imports: [CardRenderer],
  template: `
    <div
      #container
      class="relative h-full w-full overflow-hidden bg-game-felt dark:bg-game-felt-dark"
    >
      @if (reducedMotion) {
        <p
          class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          Awaiting next game
        </p>
      } @else {
        <div
          class="absolute overflow-hidden rounded-[5px] border border-card-border bg-card-bg"
          [style.transform]="'translate(' + x() + 'px, ' + y() + 'px)'"
          [style.will-change]="'transform'"
        >
          <app-card-renderer
            [cardName]="cardName()"
            alt="Bouncing card"
            [width]="100"
            [height]="140"
          />
        </div>
      }
    </div>
  `,
  host: { class: 'block h-full' },
})
export class BouncingCard implements OnDestroy {
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

  protected readonly x = signal(0);
  protected readonly y = signal(0);
  protected readonly cardName = signal(randomCard());

  protected readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private animationId = 0;
  private dx = 2;
  private dy = 2;
  private posX = 0;
  private posY = 0;

  private readonly CARD_WIDTH = 100;
  private readonly CARD_HEIGHT = 140;

  constructor() {
    afterNextRender(() => {
      if (this.reducedMotion) return;
      this.initPosition();
      this.animate();
    });
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private initPosition(): void {
    const rect = this.container().nativeElement.getBoundingClientRect();
    const maxX = rect.width - this.CARD_WIDTH;
    const maxY = rect.height - this.CARD_HEIGHT;
    this.posX = Math.random() * Math.max(0, maxX);
    this.posY = Math.random() * Math.max(0, maxY);

    // Randomize initial direction
    const speed = 2;
    const angle = Math.random() * 2 * Math.PI;
    this.dx = Math.cos(angle) * speed;
    this.dy = Math.sin(angle) * speed;

    this.x.set(this.posX);
    this.y.set(this.posY);
  }

  private animate(): void {
    const step = () => {
      const el = this.container().nativeElement;
      const maxX = el.clientWidth - this.CARD_WIDTH;
      const maxY = el.clientHeight - this.CARD_HEIGHT;

      this.posX += this.dx;
      this.posY += this.dy;

      let bounced = false;

      if (this.posX <= 0) {
        this.posX = 0;
        this.dx = Math.abs(this.dx);
        bounced = true;
      } else if (this.posX >= maxX) {
        this.posX = maxX;
        this.dx = -Math.abs(this.dx);
        bounced = true;
      }

      if (this.posY <= 0) {
        this.posY = 0;
        this.dy = Math.abs(this.dy);
        bounced = true;
      } else if (this.posY >= maxY) {
        this.posY = maxY;
        this.dy = -Math.abs(this.dy);
        bounced = true;
      }

      if (bounced) {
        this.cardName.set(randomCard(this.cardName()));
      }

      this.x.set(this.posX);
      this.y.set(this.posY);

      this.animationId = requestAnimationFrame(step);
    };

    this.animationId = requestAnimationFrame(step);
  }
}
