import {
  CdkDrag,
  CdkDragDrop,
  CdkDragEnd,
  CdkDragPreview,
  CdkDragStart,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  isDevMode,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CardRenderer } from './card-renderer';
import {
  computeBiasedPosition,
  computeCardPositions,
  computeScaleFactor,
  type CardDragEvent,
  type CardEntry,
  type CardPosition,
  type CardSelectEvent,
  type CardSelectionEvent,
} from './card-stack-layout';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-card-stack',
  imports: [CardRenderer, CdkDropList, CdkDrag, CdkDragPreview],
  template: `
    @if (cards().length === 0) {
      <div
        data-testid="card-stack-placeholder"
        class="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-md"
        [class.droppable]="droppable()"
        [style.width.px]="resolvedWidth()"
        [style.height.px]="resolvedHeight()"
        role="listbox"
        aria-label="Empty card stack"
        cdkDropList
        #dropList="cdkDropList"
        [cdkDropListDisabled]="!droppable()"
        [cdkDropListData]="cards()"
        [cdkDropListConnectedTo]="connectedDropLists()"
        (cdkDropListDropped)="onDrop($event)"
      ></div>
    } @else {
      <div
        data-testid="card-stack"
        class="relative inline-block"
        role="listbox"
        tabindex="-1"
        [attr.aria-label]="'Card stack with ' + cards().length + ' cards'"
        [style.width.px]="scaledWidth()"
        [style.height.px]="scaledHeight()"
        (keydown)="onContainerKeydown($event)"
      >
        <div
          data-testid="card-stack-inner"
          class="relative"
          cdkDropList
          #dropList="cdkDropList"
          [cdkDropListDisabled]="!reorderable() && !droppable()"
          [cdkDropListData]="cards()"
          [cdkDropListConnectedTo]="connectedDropLists()"
          [cdkDropListSortingDisabled]="true"
          (cdkDropListDropped)="onDrop($event)"
          [style.transform]="innerTransform()"
          [style.transform-origin]="'top left'"
          [style.width.px]="naturalWidth()"
          [style.height.px]="naturalHeight()"
        >
          @for (card of cards(); track $index; let i = $index) {
            <div
              [attr.data-testid]="'card-item-' + i"
              [class]="'absolute ' + cardItemClass(card)"
              role="option"
              [attr.aria-label]="card ?? 'Face-down card'"
              [attr.aria-disabled]="!isLegal(card) || undefined"
              [attr.aria-selected]="isSelected(card) || undefined"
              [attr.aria-hidden]="isTopOnlyRestricted(i) || undefined"
              cdkDrag
              [cdkDragDisabled]="!reorderable() && !draggable()"
              [cdkDragData]="{ cardName: card, index: i }"
              (cdkDragStarted)="onDragStarted($event, card, i)"
              (cdkDragEnded)="onDragEnded($event, card, i)"
              [style.transform]="cardTranslate(i)"
              [style.z-index]="cardPositions()[i]?.zIndex ?? i"
            >
              <ng-template cdkDragPreview [matchSize]="true">
                <div
                  class="overflow-hidden"
                  [style.width.px]="resolvedWidth()"
                  [style.height.px]="resolvedHeight()"
                  [style.border]="cardBorderValue(card, i)"
                  [style.border-radius.px]="cardBorderRadius()"
                  [style.filter]="cardFilterStyle(card)"
                  style="box-sizing:border-box;background-color:var(--color-card-bg)"
                >
                  <app-card-renderer
                    [cardName]="card"
                    [alt]="card ?? 'Face-down card'"
                    [width]="resolvedWidth()"
                    [height]="resolvedHeight()"
                  />
                </div>
              </ng-template>
              <div
                class="overflow-hidden bg-card-bg"
                [style.transform]="cardRotation(i)"
                [style.border]="cardBorderValue(card, i)"
                [style.border-radius.px]="cardBorderRadius()"
                [style.filter]="cardFilterStyle(card)"
              >
                <button
                  type="button"
                  [attr.data-testid]="'card-button-' + i"
                  [class]="cardButtonClass(card, i)"
                  [attr.aria-disabled]="!isLegal(card) || undefined"
                  [attr.aria-label]="card ?? 'Face-down card'"
                  [disabled]="isTopOnlyRestricted(i)"
                  [attr.tabindex]="cardTabindex(i)"
                  (click)="onCardClick(card, i)"
                  (dblclick)="onCardDblClick(card, i)"
                >
                  <app-card-renderer
                    [cardName]="card"
                    [alt]="card ?? 'Face-down card'"
                    [width]="resolvedWidth()"
                    [height]="resolvedHeight()"
                  />
                </button>
              </div>
            </div>
          }
        </div>
        <span data-testid="card-stack-live" class="sr-only" aria-live="polite">{{
          liveAnnouncement()
        }}</span>
      </div>
    }
  `,
})
export class CardStack {
  /** Static registry of all active CdkDropList instances across CardStack components */
  private static readonly dropListRegistry = new Set<CdkDropList>();

  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Reference to this component's CdkDropList */
  private readonly dropListRef = viewChild<CdkDropList>('dropList');

  // ── Inputs ──
  readonly cards = input<CardEntry[]>([]);
  readonly spread = input(0.5);
  readonly spreadAngle = input(0);
  readonly cardWidth = input(0);
  readonly cardHeight = input(0);
  readonly cardAspectRatio = input(7 / 5);
  readonly selectable = input(false);
  readonly maxSelections = input(1);
  readonly legalCards = input<string[] | null>(null);
  readonly reorderable = input(false);
  readonly draggable = input(false);
  readonly droppable = input(false);
  readonly topOnly = input(false);
  readonly autoScale = input(false);
  readonly colorMap = input<Record<number, number> | null>(null);
  readonly playerIds = input<number[] | null>(null);
  readonly biasedPlacement = input(false);

  // ── Outputs ──
  readonly cardSelected = output<CardSelectEvent>();
  readonly cardConfirmed = output<CardSelectEvent>();
  readonly selectedCards = output<CardSelectionEvent>();
  readonly cardsReordered = output<CardEntry[]>();
  readonly cardDragStarted = output<CardDragEvent>();
  readonly cardReceived = output<CardDragEvent>();
  readonly cardDragCancelled = output<CardDragEvent>();

  // ── Selection state ──
  private readonly selection = signal<string[]>([]);

  // ── Keyboard navigation state ──
  private readonly focusedIndex = signal(0);
  protected readonly liveAnnouncement = signal('');

  // ── Derived: legal card set ──
  private readonly legalSet = computed(() => {
    const lc = this.legalCards();
    return lc ? new Set(lc) : null;
  });

  // ── Derived: clamped maxSelections ──
  protected readonly effectiveMaxSelections = computed(() => {
    const ms = this.maxSelections();
    return ms <= 0 ? 1 : ms;
  });

  // ── Resolved card dimensions ──
  /** Effective card width: uses cardWidth if set, otherwise derives from cardHeight / aspectRatio, fallback 72. */
  protected readonly resolvedWidth = computed(() => {
    const w = this.cardWidth();
    const h = this.cardHeight();
    const ratio = this.cardAspectRatio();
    if (w > 0) return w;
    if (h > 0 && ratio > 0) return Math.round(h / ratio);
    return 72;
  });

  /** Effective card height: uses cardHeight if set, otherwise derives from cardWidth * aspectRatio, fallback 101. */
  protected readonly resolvedHeight = computed(() => {
    const w = this.cardWidth();
    const h = this.cardHeight();
    const ratio = this.cardAspectRatio();
    if (h > 0) return h;
    if (w > 0 && ratio > 0) return Math.round(w * ratio);
    return Math.round(72 * ratio);
  });

  // ── Container width (read via afterRenderEffect) ──
  private readonly containerWidth = signal(0);

  /** Tracks whether a drag resulted in a valid drop (same or cross-stack) */
  private dragDropped = false;

  /** Stores the card info during an active drag for cancel detection */
  private activeDrag: { cardName: string; index: number } | null = null;

  /** Observes parent element resize to keep containerWidth current. */
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterRenderEffect(() => {
      const el = this.elRef.nativeElement as HTMLElement;
      const parent = el.parentElement;
      if (parent) {
        this.containerWidth.set(parent.clientWidth);

        // Observe parent resize to keep containerWidth current
        if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              this.containerWidth.set(entry.contentRect.width);
            }
          });
          this.resizeObserver.observe(parent);
        }
      }

      // Register/unregister drop list in the static registry
      const dl = this.dropListRef();
      if (dl && !CardStack.dropListRegistry.has(dl)) {
        CardStack.dropListRegistry.add(dl);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      const dl = this.dropListRef();
      if (dl) {
        CardStack.dropListRegistry.delete(dl);
      }
    });
  }

  /** Compute connected drop lists (all other CardStack drop lists except this one) */
  protected readonly connectedDropLists = computed(() => {
    this.cards();
    // Only connect to other stacks if this stack can send (draggable) or receive (droppable) cards
    if (!this.draggable() && !this.droppable()) return [];
    const own = this.dropListRef();
    const lists: CdkDropList[] = [];
    for (const dl of CardStack.dropListRegistry) {
      if (dl !== own) {
        lists.push(dl);
      }
    }
    return lists;
  });

  // ── Layout computation ──
  protected readonly cardPositions = computed<CardPosition[]>(() => {
    const cardsArr = this.cards();
    if (cardsArr.length === 0) return [];

    if (this.biasedPlacement()) {
      const pIds = this.playerIds();
      const seatCount = pIds ? new Set(pIds).size : 1;
      const uniqueIds = pIds ? [...new Set(pIds)] : [];

      return cardsArr.map((card, i) => {
        const playerID = pIds?.[i] ?? 0;
        const playerIndex = uniqueIds.indexOf(playerID);
        return computeBiasedPosition({
          cardName: card,
          playerID,
          seatCount,
          playerIndex: playerIndex >= 0 ? playerIndex : 0,
          cardWidth: this.resolvedWidth(),
          cardHeight: this.resolvedHeight(),
        });
      });
    }

    return computeCardPositions({
      count: cardsArr.length,
      spread: this.spread(),
      spreadAngle: this.spreadAngle(),
      cardWidth: this.resolvedWidth(),
      cardHeight: this.resolvedHeight(),
    });
  });

  // ── Natural dimensions (bounding box of all card positions + one card) ──
  protected readonly naturalWidth = computed(() => {
    const positions = this.cardPositions();
    const w = this.resolvedWidth();
    if (positions.length === 0) return w;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const pos of positions) {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
    }
    return maxX - minX + w;
  });

  protected readonly naturalHeight = computed(() => {
    const positions = this.cardPositions();
    const h = this.resolvedHeight();
    if (positions.length === 0) return h;

    let minY = Infinity;
    let maxY = -Infinity;
    for (const pos of positions) {
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    return maxY - minY + h;
  });

  // ── Scale factor ──
  protected readonly scaleFactor = computed(() => {
    if (!this.autoScale()) return 1;
    const cw = this.containerWidth();
    const nw = this.naturalWidth();
    if (cw <= 0 || nw <= 0) return 1;
    return computeScaleFactor(nw, cw);
  });

  protected readonly innerTransform = computed(() => {
    const factor = this.scaleFactor();
    return factor < 1 ? `scale(${factor})` : '';
  });

  protected readonly scaledWidth = computed(() => {
    return this.naturalWidth() * this.scaleFactor();
  });

  protected readonly scaledHeight = computed(() => {
    return this.naturalHeight() * this.scaleFactor();
  });

  // ── Per-card transform ──
  private readonly originOffset = computed(() => {
    const positions = this.cardPositions();
    if (positions.length === 0) return { x: 0, y: 0 };

    let minX = Infinity;
    let minY = Infinity;
    for (const pos of positions) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
    }
    return { x: minX, y: minY };
  });

  protected cardTranslate(index: number): string {
    const positions = this.cardPositions();
    const pos = positions[index];
    if (!pos) return '';

    const offset = this.originOffset();
    const x = pos.x - offset.x;
    const y = pos.y - offset.y;
    return `translate(${x}px, ${y}px)`;
  }

  protected cardRotation(index: number): string {
    const positions = this.cardPositions();
    const pos = positions[index];
    if (!pos || pos.rotation === 0) return '';
    return `rotate(${pos.rotation}deg)`;
  }

  // ── Card border ──
  /** SVG corner radius as a fraction of card width (rx 10.63 / viewBox width 222.23). */
  private static readonly CORNER_RATIO = 10.629921 / 222.23162;

  /** Border radius in px, matching the SVG's internal rounded rect corners. */
  protected readonly cardBorderRadius = computed(() => {
    return this.resolvedWidth() * CardStack.CORNER_RATIO;
  });

  /** Returns the CSS border shorthand: selected (primary) > player halo > default. */
  protected cardBorderValue(card: string | null, index: number): string {
    if (this.isSelected(card)) {
      return '2px solid var(--color-primary-light)';
    }
    const halo = this.cardHaloColor(index);
    if (halo) {
      return `2px solid ${halo}`;
    }
    return '1px solid var(--color-card-border)';
  }

  /** Returns the halo HSL color string for a card, or empty string if none. */
  private cardHaloColor(index: number): string {
    const map = this.colorMap();
    const pIds = this.playerIds();
    if (!map || !pIds) return '';

    if (pIds.length !== this.cards().length) {
      if (isDevMode()) {
        console.warn(
          `CardStack: playerIds length (${pIds.length}) does not match cards length (${this.cards().length}). Skipping halos.`,
        );
      }
      return '';
    }

    const playerID = pIds[index];
    if (map[playerID] === undefined) return '';

    const hue = map[playerID];
    return `hsl(${hue} 75% var(--card-halo-lightness))`;
  }

  // ── Legal / Selected helpers ──
  protected isLegal(card: string | null): boolean {
    if (card === null) return false;
    const set = this.legalSet();
    return set === null || set.has(card);
  }

  protected isSelected(card: string | null): boolean {
    if (card === null) return false;
    return this.selection().includes(card);
  }

  // ── Card item class (on the card-item div — handles hover lift) ──
  protected cardItemClass(card: string | null): string {
    const interactive = this.selectable() || this.reorderable();
    if (!interactive) return '';

    const legal = this.isLegal(card);
    const selected = this.isSelected(card);

    if (legal) {
      const selectedClass = selected ? ' -translate-y-2' : '';
      return `transition-transform duration-100 hover:-translate-y-1${selectedClass}`;
    }

    return '';
  }

  // ── Card button class (on the button — handles cursor only) ──
  protected cardButtonClass(card: string | null, _index: number): string {
    const interactive = this.selectable() || this.reorderable();
    const base = 'block focus:outline-none';

    if (!interactive) return `${base} cursor-default`;

    if (this.isLegal(card)) return `${base} cursor-pointer`;

    return `${base} ${this.reorderable() ? 'cursor-grab' : 'cursor-default'}`;
  }

  // ── Card filter style (muting non-playable cards without transparency) ──
  protected cardFilterStyle(card: string | null): string {
    const interactive = this.selectable() || this.reorderable();
    if (!interactive) return '';
    if (this.isLegal(card)) return '';
    return 'brightness(0.6) saturate(0.3)';
  }

  // ── Top-only restriction helper ──
  protected isTopOnlyRestricted(index: number): boolean {
    return this.topOnly() && index !== this.cards().length - 1;
  }

  // ── Roving tabindex ──
  protected cardTabindex(index: number): number {
    return index === this.focusedIndex() ? 0 : -1;
  }

  // ── Keyboard navigation ──
  protected onContainerKeydown(event: KeyboardEvent): void {
    const cardsArr = this.cards();
    if (cardsArr.length === 0) return;

    const current = this.focusedIndex();

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        if (event.altKey && this.reorderable()) {
          // Alt+Arrow: reorder card forward
          event.preventDefault();
          this.keyboardReorder(current, current + 1);
          return;
        }
        event.preventDefault();
        const next = (current + 1) % cardsArr.length;
        this.moveFocus(next);
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        if (event.altKey && this.reorderable()) {
          // Alt+Arrow: reorder card backward
          event.preventDefault();
          this.keyboardReorder(current, current - 1);
          return;
        }
        event.preventDefault();
        const prev = (current - 1 + cardsArr.length) % cardsArr.length;
        this.moveFocus(prev);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const card = cardsArr[current];
        if (this.isLegal(card) && !this.isTopOnlyRestricted(current)) {
          this.onCardClick(card, current);
        }
        break;
      }
      default:
        return; // Don't prevent default for unhandled keys
    }
  }

  private moveFocus(index: number): void {
    this.focusedIndex.set(index);
    const el = this.elRef.nativeElement as HTMLElement;
    const btn = el.querySelector<HTMLElement>(`[data-testid="card-button-${index}"]`);
    btn?.focus();
  }

  private keyboardReorder(fromIndex: number, toIndex: number): void {
    const cardsArr = this.cards();
    if (cardsArr.length < 2) return;

    // Wrap around
    const target = (toIndex + cardsArr.length) % cardsArr.length;

    const reordered = [...cardsArr];
    moveItemInArray(reordered, fromIndex, target);
    this.cardsReordered.emit(reordered);

    // Update focus to follow the moved card
    this.focusedIndex.set(target);

    // Announce the reorder for screen readers
    const card = cardsArr[fromIndex];
    const label = card ?? 'Face-down card';
    this.liveAnnouncement.set(`${label} moved to position ${target + 1} of ${cardsArr.length}`);
  }

  // ── Click handlers ──
  protected onCardClick(card: string | null, index: number): void {
    if (!this.selectable()) return;
    if (this.isTopOnlyRestricted(index)) return;
    if (!this.isLegal(card)) return;
    if (card === null) return;

    this.cardSelected.emit({ cardName: card, index });

    const max = this.effectiveMaxSelections();
    const current = this.selection();

    if (max === 1) {
      // Single-select: toggle or replace
      if (current.includes(card)) {
        this.selection.set([]);
      } else {
        this.selection.set([card]);
      }
    } else {
      // Multi-select: toggle
      if (current.includes(card)) {
        this.selection.set(current.filter((c) => c !== card));
      } else if (current.length < max) {
        this.selection.set([...current, card]);
      } else {
        // At max, ignore click on unselected card
        return;
      }
    }

    this.selectedCards.emit(this.selection());
  }

  protected onCardDblClick(card: string | null, index: number): void {
    if (!this.selectable()) return;
    if (this.isTopOnlyRestricted(index)) return;
    if (!this.isLegal(card)) return;
    if (card === null) return;

    this.cardConfirmed.emit({ cardName: card, index });
  }

  // ── Drag-and-drop ──
  protected onDragStarted(_event: CdkDragStart, card: string | null, index: number): void {
    this.dragDropped = false;
    if (this.draggable() && card !== null) {
      this.activeDrag = { cardName: card, index };
      this.cardDragStarted.emit({ cardName: card, index });
    }
  }

  protected onDragEnded(_event: CdkDragEnd, card: string | null, index: number): void {
    // If the drag ended without a valid drop, it was cancelled
    if (!this.dragDropped && this.activeDrag && card !== null) {
      this.cardDragCancelled.emit({ cardName: card, index });
    }
    this.activeDrag = null;
    this.dragDropped = false;
  }

  protected onDrop(event: CdkDragDrop<CardEntry[]>): void {
    this.dragDropped = true;
    const sameContainer = event.previousContainer === event.container;

    if (sameContainer) {
      // Same stack → reorder, but only if the drop point is inside the container
      if (event.dropPoint && !this.isInsideDropList(event.dropPoint)) {
        return; // Dropped outside — treat as cancel, no reorder
      }

      const sourceIndex = (event.item.data as { index: number }).index;
      const targetIndex = event.dropPoint
        ? this.findNearestIndex(event.dropPoint)
        : event.currentIndex;

      if (sourceIndex !== targetIndex) {
        const reordered = [...this.cards()];
        moveItemInArray(reordered, sourceIndex, targetIndex);
        this.cardsReordered.emit(reordered);
      }
    } else {
      // Cross-stack transfer
      const dragData = event.item.data as { cardName: string; index: number } | undefined;
      const cardName =
        dragData?.cardName ?? (event.previousContainer.data[event.previousIndex] as string);
      this.cardReceived.emit({ cardName, index: event.currentIndex });
    }
  }

  /** Check if a screen-space point is inside this stack's drop list element. */
  private isInsideDropList(point: { x: number; y: number }): boolean {
    const el = this.elRef.nativeElement as HTMLElement;
    const dropListEl = el.querySelector('[data-testid="card-stack-inner"]') as HTMLElement;
    if (!dropListEl) return false;
    const rect = dropListEl.getBoundingClientRect();
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
  }

  /** Find the card index closest to a screen-space point. */
  private findNearestIndex(point: { x: number; y: number }): number {
    const el = this.elRef.nativeElement as HTMLElement;
    const positions = this.cardPositions();
    const offset = this.originOffset();
    const cards = this.cards();

    if (cards.length <= 1) return 0;

    // Get the bounding rect of the drop list container to convert screen coords to local
    const dropListEl = el.querySelector('.cdk-drop-list') as HTMLElement;
    if (!dropListEl) return 0;
    const rect = dropListEl.getBoundingClientRect();
    const scale = this.scaleFactor();

    const localX = (point.x - rect.left) / scale;
    const localY = (point.y - rect.top) / scale;

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i < positions.length; i++) {
      const cx = positions[i].x - offset.x + this.resolvedWidth() / 2;
      const cy = positions[i].y - offset.y + this.resolvedHeight() / 2;
      const dist = (localX - cx) ** 2 + (localY - cy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
}
