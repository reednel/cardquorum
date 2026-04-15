# Game Table UI

How the frontend renders an active game. This doc covers the generic table shell, the plugin-to-UI contract, and the `CardStack` component in depth.

## Architecture Overview

The game table UI has three layers:

```text
GameTable (game-specific orchestrator)
  └─ GameTableShell (generic layout: seats, play area, hand, overlays)
       ├─ PlayerSeat × N (opponent card backs via CardStack)
       ├─ CardStack (center trick pile)
       ├─ CardStack (local player hand)
       └─ Phase overlays (deal, pick, bury, call, score)
```

`GameTableShell` is game-agnostic. It positions opponent seats around an arc, projects content slots for the play area, hand, and overlays, and shows a status bar. It never imports game-specific types.

`GameTable` is the game-specific orchestrator. It wires the `GameTablePlugin` adapter to the shell and CardStack instances, translating game state into the inputs each component needs.

## GameTablePlugin (UI Adapter)

Defined in `@cardquorum/shared`, this is the contract between the generic table and a game-specific adapter. It's separate from the backend `GamePlugin` — this one is frontend-only and deals with rendering concerns.

```typescript
interface GameTablePlugin<TState = unknown, TEvent = unknown> {
  getCardAsset(cardName: string): CardAsset;
  getLegalCards(state: TState, validActions: string[]): string[];
  getActiveOverlay(state: TState, validActions: string[]): string | null;
  buildPlayCardEvent(state: TState, cardName: string): TEvent;
  buildBuryEvent(state: TState, cardNames: string[]): TEvent;
  getCurrentTrick(state: TState): TrickPlayView[] | null;
  getPlayerSeats(state: TState, myUserID: number): SeatInfo[];
  getStatusInfo(state: TState): StatusInfo;
  getMyHand(state: TState, myUserID: number): string[];
}
```

Key methods for CardStack integration:

- `getMyHand` returns card name strings for the local player's hand
- `getLegalCards` returns which cards can be played right now
- `getCurrentTrick` returns the center pile plays with player IDs
- `getPlayerSeats` returns opponent seat info including hand sizes (for card-back fans)

## CardStack Component

`CardStack` (`app-card-stack`) is the unified card display component. It replaces the old `PlayerHand`, `PlayArea`, and `PlayerSeat` card-back fan with a single configurable component.

### Inputs

| Input             | Type                             | Default | Description                                          |
| ----------------- | -------------------------------- | ------- | ---------------------------------------------------- |
| `cards`           | `(string \| null)[]`             | `[]`    | Card entries. String = face-up, null = face-down.    |
| `spread`          | `number`                         | `0.5`   | 0 = fully stacked, 1 = fully spread.                 |
| `spreadAngle`     | `number`                         | `0`     | Degrees of arc. 0 = straight line.                   |
| `cardWidth`       | `number`                         | `72`    | Card width in pixels.                                |
| `cardHeight`      | `number`                         | `100`   | Card height in pixels.                               |
| `selectable`      | `boolean`                        | `false` | Whether cards respond to click/dblclick.             |
| `maxSelections`   | `number`                         | `1`     | Max simultaneous selections.                         |
| `legalCards`      | `string[] \| null`               | `null`  | Legal card names. Null = all interactive.            |
| `reorderable`     | `boolean`                        | `false` | Whether cards can be reordered by dragging.          |
| `draggable`       | `boolean`                        | `false` | Whether cards can be dragged to other stacks.        |
| `droppable`       | `boolean`                        | `false` | Whether the stack accepts cards from other stacks.   |
| `topOnly`         | `boolean`                        | `false` | Restrict interaction to the last card only.          |
| `colorMap`        | `Record<number, number> \| null` | `null`  | userId → hue for colored halos.                      |
| `playerIds`       | `number[] \| null`               | `null`  | Parallel to `cards`, maps each card to a player.     |
| `biasedPlacement` | `boolean`                        | `false` | Deterministic random positioning (middle pile mode). |

### Outputs

| Output              | Payload               | Description                                |
| ------------------- | --------------------- | ------------------------------------------ |
| `cardSelected`      | `{ cardName, index }` | Single click on a legal card.              |
| `cardConfirmed`     | `{ cardName, index }` | Double-click on a legal card.              |
| `selectedCards`     | `string[]`            | Current selection set after any change.    |
| `cardsReordered`    | `(string \| null)[]`  | New card order after within-stack reorder. |
| `cardDragStarted`   | `{ cardName, index }` | Card started being dragged out.            |
| `cardReceived`      | `{ cardName, index }` | Card from another stack dropped here.      |
| `cardDragCancelled` | `{ cardName, index }` | Drag cancelled (Escape or drop outside).   |

### Configuration Presets

The three standard configurations used in the current game table:

**Player hand:**

```html
<app-card-stack
  [cards]="myHand()"
  [spread]="0.7"
  [spreadAngle]="15"
  [selectable]="true"
  [reorderable]="true"
  [legalCards]="legalCards()"
  (cardConfirmed)="onCardConfirmed($event)"
  (cardsReordered)="onHandReordered($event)"
/>
```

**Center trick pile:**

```html
<app-card-stack
  [cards]="trickCardNames()"
  [spread]="0.3"
  [spreadAngle]="360"
  [biasedPlacement]="true"
  [cardWidth]="60"
  [cardHeight]="84"
  [colorMap]="colorMap()"
  [playerIds]="trickPlayerIds()"
/>
```

**Opponent card backs:**

```html
<app-card-stack [cards]="cardBacks()" [spread]="0.4" [cardWidth]="40" [cardHeight]="56" />
```

### Visual States

Cards have three visual modes depending on the stack's configuration:

1. **Interactive + legal** — full color, `cursor: pointer`, lifts on hover, can be selected/confirmed
2. **Interactive + illegal** — dimmed via `filter: brightness(0.6) saturate(0.3)` (no transparency, so overlapping cards don't bleed through), `cursor: grab` if reorderable
3. **Non-interactive** — full color, `cursor: default`, no hover effect (used for center pile, opponent seats)

### Layout Engine

Card positions are computed by pure functions in `card-stack-layout.ts`:

- `computeCardPositions(params)` — straight-line or arc layout based on `spreadAngle`
- `computeBiasedPosition(params)` — deterministic random placement for the middle pile
- `computeScaleFactor(naturalWidth, containerWidth)` — auto-scaling when container is too small

These are independently testable with no DOM or Angular dependencies.

### Reorder Flow

When a player reorders cards in their hand:

1. Player drags a card to a new position within the hand
2. CDK fires `cdkDropListDropped` on the same container
3. `onDrop` computes the target index from the drop point using `findNearestIndex`
4. `cardsReordered` emits the new card order
5. `GameTable.onHandReordered` updates a local `handOrder` signal
6. The `myHand` computed merges the local order with the server's hand (filtering removed cards, appending new ones)

The server never knows about hand reordering — it's purely a local UI preference.

### Selection Flow

Single-select (default): click selects, click again deselects. Double-click confirms (plays the card).

Multi-select (`maxSelections > 1`): click toggles. Used for bury selection in Sheepshead.

Selection state is internal to the component. The parent reacts to `selectedCards` and `cardConfirmed` outputs.

## CDK Drag-Drop: Gotchas and Design Decisions

The drag-and-drop implementation uses Angular CDK's `CdkDrag`/`CdkDropList`. This section documents the hard-won lessons from getting it to work with absolutely-positioned, overlapping cards.

### CDK Clears `left` and `top` on Drag Elements

CDK's `toggleVisibility` function sets `left: ''` and `top: ''` when restoring a drag element after a drop. If you position cards with `[style.left.px]` and `[style.top.px]`, those values get wiped and Angular's `OnPush` change detection won't re-apply them (the signal values haven't changed).

**Solution:** Position cards with `transform: translate()` instead. CDK captures `initialTransform` at drag start and restores it at drag end, so transform-based positioning survives the drag lifecycle.

### CDK Sorting Doesn't Work with Absolute Positioning

CDK's sorting algorithm assumes elements are in normal document flow (flex/block). With `position: absolute`, it can't compute meaningful indices or animate reorder.

**Solution:** Set `[cdkDropListSortingDisabled]="true"` and compute the target index ourselves using `findNearestIndex`, which maps the drop point to the nearest card slot based on our layout positions.

### Drop Outside Container Still Fires `onDrop`

When you drag a card outside the drop list boundary and release, CDK still fires the `cdkDropListDropped` event on the originating container with `sameContainer: true`. Without a guard, this causes unwanted reordering based on the pointer's x-coordinate.

**Solution:** Check `isInsideDropList(event.dropPoint)` before processing a same-container drop. If the point is outside the container's bounding rect, treat it as a cancel.

### Custom Drag Preview and `matchSize`

`CdkDragPreview` is a structural directive (`ng-template[cdkDragPreview]`). The `matchSize` input must be bound on the `ng-template`, not on the host element inside `*cdkDragPreview`:

```html
<!-- WRONG — matchSize is an HTML attribute on the div, not an input to CdkDragPreview -->
<div *cdkDragPreview matchSize>...</div>

<!-- CORRECT — matchSize is bound to the CdkDragPreview directive -->
<ng-template cdkDragPreview [matchSize]="true">
  <div>...</div>
</ng-template>
```

Without `matchSize`, CDK sets the pickup position to `{x: 0, y: 0}`, causing the preview's top-left corner to snap to the cursor.

### Connected Drop Lists and the Static Registry

CardStack uses a static `Set<CdkDropList>` to track all active drop list instances across component instances. The `connectedDropLists` computed returns all other stacks' drop lists.

**Critical:** Only connect to other stacks when `draggable` or `droppable` is true. If a reorder-only stack (like the hand) connects to a display-only stack (like the center pile), CDK may route drops to the wrong container, causing cards to teleport.

### Scale Transform and CDK Coordinates

If the drop list container has a CSS `transform: scale()`, CDK's coordinate calculations use the scaled bounding rect (from `getBoundingClientRect`). The `findNearestIndex` method accounts for this by dividing the local coordinates by the scale factor.

### CardRenderer Host Display

`CardRenderer` uses `host: { class: 'block' }`. It was originally `inline-block`, which caused a baseline gap below the SVG — visible as extra space at the bottom of the card, making the player-color halo not wrap tightly. Changing to `block` eliminates this.

## Adding a New Game's Table UI

1. Create a `GameTablePlugin` adapter in `apps/frontend/src/app/game/<game>/`
2. Implement all methods — especially `getMyHand`, `getLegalCards`, `getCurrentTrick`, `getPlayerSeats`
3. Create a `GameTable` component that wires the adapter to `GameTableShell` and `CardStack` instances
4. Use the configuration presets above as starting points, adjusting `spread`, `spreadAngle`, card dimensions, etc.
5. If the game needs cross-stack drag (e.g. moving cards between zones), set `draggable`/`droppable` on the relevant stacks and handle `cardDragStarted`/`cardReceived` events
6. If the game needs multi-select (e.g. discarding multiple cards), set `maxSelections` and listen to `selectedCards`
