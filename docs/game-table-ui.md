# Game Table UI

How the frontend renders an active game. This doc covers the component architecture, the plugin-to-UI contract, the `InteractionController` state machine, and the `CardStack` component in depth.

## Architecture Overview

The game table UI has four layers, connected via `NgComponentOutlet` for dynamic game resolution:

```text
GameTable (generic orchestrator — resolves game type, provides InteractionController)
  └─ NgComponentOutlet → SheepsheadTable (game-specific table, resolved at runtime)
       └─ GameTableShell (generic layout: seats, play area, hand, overlays)
            ├─ PlayerSeat × N (opponent card backs via CardStack)
            ├─ CardStack (center trick pile, stackId="trick-pile")
            ├─ CardStack (local player hand, stackId="hand")
            ├─ CardStack (bury target, stackId="buried")
            └─ Phase overlays (deal, pick, bury, call, score)
```

### GameTable (Generic Orchestrator)

`GameTable` is now game-agnostic. It resolves the game type from `GameService.gameType()` and uses two registries (`GAME_TABLE_COMPONENTS` and `GAME_TABLE_PLUGINS` from `game-registry.ts`) to look up the correct table component and plugin at runtime. It renders the resolved component via `NgComponentOutlet`, passing inputs (`myUserID`, `members`, `isOwner`, `autostart`, `startNextGame`) through a `gameTableInputs()` computed.

`GameTable` also:

- Provides `InteractionController` at the component level (so each game table instance gets its own interaction state)
- Initializes the IC with a stable dispatcher (created once as a class field, wired to `GameService.queryTargets` / `sendAction`) and a plugin adapter (recreated only when the plugin signal changes, wired to the resolved plugin's `getDefaultTarget` / `buildMoveEvent`)
- Forwards `GameService.validTargetsResponse()` to `InteractionController.receiveValidTargets()`
- Resets IC state when the game phase or valid actions change (prevents stale glowing targets / stuck selections across turn boundaries)
- Hosts an `aria-live="polite"` region for IC announcements

### Game-Specific Table (e.g. SheepsheadTable)

`SheepsheadTable` is the game-specific orchestrator. It owns all Sheepshead-specific template logic (phase switching, call options, crack/blitz buttons, score overlay) and wires the `SheepsheadTablePlugin` adapter to `GameTableShell` and `CardStack` instances. It injects `InteractionController` (provided by the parent `GameTable`) and `GameService`.

Key difference from the old architecture: `SheepsheadTable` no longer handles card click/confirm/drag events directly. Those flow through the `InteractionController` via `CardStack`'s IC integration. The hand `CardStack` sets `[draggable]="true"` during play and bury phases, and the target stacks (`trick-pile`, `buried`) set `[droppable]="true"`.

### GameTableShell (Generic Layout)

`GameTableShell` is game-agnostic. It positions opponent seats around an arc, projects content slots for the play area, hand, corner actions, and overlays, and shows a status bar. It never imports game-specific types. It receives its data through inputs from the game-specific table component.

### Game Registry

`game-registry.ts` exports two lookup tables:

```typescript
export const GAME_TABLE_COMPONENTS: Record<string, Type<unknown>> = {
  sheepshead: SheepsheadTable,
};

export const GAME_TABLE_PLUGINS: Record<string, GameTablePlugin> = {
  sheepshead: SheepsheadTablePlugin,
};
```

Adding a new game means adding entries to both maps. The `gameType` string (e.g. `"sheepshead"`) comes from the server's `GameStartedPayload.gameType` field.

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
  getBlindCards(state: TState): (string | null)[];
  getBuryCount(state: TState, config: unknown): number;
  buildMoveEvent(state: TState, selectedCards: string[], targetStackId: string): TEvent;
  getDefaultTarget(state: TState, validActions: string[]): string | null;
}
```

Key methods for CardStack integration:

- `getMyHand` returns card name strings for the local player's hand
- `getLegalCards` returns which cards can be played right now
- `getCurrentTrick` returns the center pile plays with player IDs
- `getPlayerSeats` returns opponent seat info including hand sizes (for card-back fans)
- `buildMoveEvent` builds a game event from selected cards and a target stack ID — used by the InteractionController to dispatch moves without knowing game-specific event shapes
- `getDefaultTarget` returns the default target stack ID for simple interactions (e.g. `"trick-pile"` during play phase), or `null` if a server query is needed — enables double-click-to-play shortcuts

## InteractionController

`InteractionController` is an `@Injectable()` service provided at the `GameTable` component level. It coordinates card interactions across all `CardStack` instances on the table, managing a three-phase state machine: `idle → selecting → targeting`.

### Why It Exists

Before the IC, card interactions were handled locally within each `CardStack` via outputs (`cardConfirmed`, `cardSelected`, etc.) and the parent component wired them together imperatively. This worked for one-to-one interactions (double-click a card → play it to the one valid stack) but broke down for:

- **One-to-many**: player selects a card, then must choose which of several stacks to drop it on
- **Many-to-one**: player selects multiple cards (e.g. bury), then commits them to a target
- **Many-to-many**: combinations of the above
- **Drag-and-drop across stacks**: CDK drag-drop needs coordination between source and target containers

The IC centralizes this coordination. Each `CardStack` registers itself with a semantic `stackId` (e.g. `"hand"`, `"trick-pile"`, `"buried"`) and delegates click/drag decisions to the IC.

### State Machine

```text
idle ──[card click]──► selecting ──[valid targets received]──► targeting ──[target click/drop]──► idle
  ▲                        │                                       │
  └────────────────────────┴──────────[cancel / reset]─────────────┘
```

**idle**: No interaction in progress. Cards can be clicked or dragged.

**selecting**: One or more cards are selected in a source stack. The IC has sent a `queryTargets` request to the server and is waiting for the response. Additional cards can be toggled in/out of the selection (up to `maxSelections`).

**targeting**: Valid target stack IDs have been received from the server. Target stacks glow (via the `highlighted` computed on CardStack). The player can click a highlighted target or drag-drop onto it to commit the move.

### Interfaces

The IC is decoupled from both `GameService` and the game-specific plugin via two callback interfaces, provided during `init()`:

```typescript
interface InteractionDispatcher {
  queryTargets(sourceStackId: string, selectedCards: string[], generation: number): void;
  sendAction(event: { type: string; payload?: unknown }): void;
}

interface InteractionPluginAdapter {
  getDefaultTarget(): string | null;
  buildMoveEvent(
    selectedCards: string[],
    targetStackId: string,
  ): { type: string; payload?: unknown };
}
```

`InteractionDispatcher` wraps `GameService` methods. `InteractionPluginAdapter` wraps the resolved `GameTablePlugin` methods, reading state/validActions lazily via signals so the adapter closures always have fresh values.

### Stack Registration

Each `CardStack` with a `stackId` registers its root `HTMLElement` with the IC on render and unregisters on destroy:

```typescript
afterRenderEffect(() => {
  const id = this.stackId();
  const ic = this.interactionController;
  if (id && ic) ic.register(id, this.elRef.nativeElement);
});
```

The registry maps stack IDs to `HTMLElement` references. The IC uses these for bounding-rect hit-testing during drag-drop via its `resolveDropTarget` method. Storing `HTMLElement` instead of full component references avoids circular imports and keeps the IC's surface area minimal.

### Target Query Flow (Server Round-Trip)

When a card is selected, the IC sends a `queryTargets` request to the server via the dispatcher. The flow:

1. `CardStack.onCardClick` → `ic.selectCard(stackId, card, maxSelections)`
2. IC transitions to `selecting`, calls `dispatcher.queryTargets(sourceStackId, selectedCards, generation)`
3. `GameService` sends `game:query-targets` WebSocket event to the server
4. Server calls `GamePlugin.getValidTargets(config, state, userID, sourceStackId, selectedCards)` — a read-only query that doesn't modify state
5. Server responds with `game:valid-targets` containing `{ generation, targets: string[] }`
6. `GameService.validTargetsResponse` signal updates
7. `GameTable` effect forwards to `ic.receiveValidTargets(generation, targets)`
8. IC filters targets to registered stack IDs, transitions to `targeting`
9. Target stacks' `highlighted` computed becomes `true`, triggering visual glow

The `generation` counter prevents stale responses from overwriting newer queries.

### Double-Click Shortcut

When `getDefaultTarget()` returns a non-null stack ID (e.g. `"trick-pile"` during play phase), double-clicking a card bypasses the full query flow:

1. `CardStack.onCardDblClick` → `ic.confirmCard(stackId, card)`
2. IC calls `pluginAdapter.buildMoveEvent([card], defaultTarget)`
3. IC calls `dispatcher.sendAction(event)` and resets to idle

No server round-trip for target validation — the plugin already knows the answer.

### Signals (Public Readonly)

| Signal             | Type                                   | Description                                       |
| ------------------ | -------------------------------------- | ------------------------------------------------- |
| `phase`            | `'idle' \| 'selecting' \| 'targeting'` | Current state machine phase                       |
| `selectedCards`    | `string[]`                             | Currently selected card names                     |
| `sourceStack`      | `string \| null`                       | Stack ID where selection originated               |
| `validTargets`     | `string[]`                             | Stack IDs that are valid drop/click targets       |
| `isDragging`       | `boolean`                              | Whether a drag is in progress                     |
| `liveAnnouncement` | `string`                               | Accessibility announcement for `aria-live` region |

### Reset Triggers

The IC resets to idle when:

- The game phase changes (deal → pick → bury → play → score)
- The valid actions change (active player rotates within a phase)
- The user presses Escape
- A move is committed
- The source stack is unregistered (component destroyed)

## CardStack Component

`CardStack` (`app-card-stack`) is the unified card display component. It replaces the old `PlayerHand`, `PlayArea`, and `PlayerSeat` card-back fan with a single configurable component.

### Inputs

| Input               | Type                             | Default | Description                                                                                                                            |
| ------------------- | -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `stackId`           | `string \| null`                 | `null`  | Semantic identifier for IC registration. When set, the stack participates in the InteractionController system.                         |
| `cards`             | `(string \| null)[]`             | `[]`    | Card entries. String = face-up, null = face-down.                                                                                      |
| `spread`            | `number`                         | `0.5`   | 0 = fully stacked, 1 = fully spread.                                                                                                   |
| `spreadAngle`       | `number`                         | `0`     | Degrees of arc. 0 = straight line.                                                                                                     |
| `cardWidth`         | `number`                         | `0`     | Card width in px. If 0, derived from `cardHeight / cardAspectRatio`. Falls back to 72 when both are 0.                                 |
| `cardHeight`        | `number`                         | `0`     | Card height in px. If 0, derived from `cardWidth * cardAspectRatio`. Falls back to `round(72 * ratio)` when both are 0.                |
| `cardAspectRatio`   | `number`                         | `7 / 5` | Height-to-width ratio (standard poker card = 3.5:2.5). Used to infer the missing dimension when only one of width/height is provided.  |
| `selectable`        | `boolean`                        | `false` | Whether cards respond to click/dblclick.                                                                                               |
| `maxSelections`     | `number`                         | `1`     | Max simultaneous selections.                                                                                                           |
| `legalCards`        | `string[] \| null`               | `null`  | Legal card names. Null = all interactive.                                                                                              |
| `reorderable`       | `boolean`                        | `false` | Whether cards can be reordered by dragging.                                                                                            |
| `draggable`         | `boolean`                        | `false` | Whether cards can be dragged to other stacks.                                                                                          |
| `droppable`         | `boolean`                        | `false` | Whether the stack accepts cards from other stacks.                                                                                     |
| `topOnly`           | `boolean`                        | `false` | Restrict interaction to the last card only.                                                                                            |
| `colorMap`          | `Record<number, number> \| null` | `null`  | userId → hue for colored card borders.                                                                                                 |
| `playerIds`         | `number[] \| null`               | `null`  | Parallel to `cards`, maps each card to a player.                                                                                       |
| `biasedPlacement`   | `boolean`                        | `false` | Deterministic random positioning (middle pile mode).                                                                                   |
| `autoScale`         | `boolean`                        | `false` | Scale down when content exceeds parent width. Only enable on stacks whose parent has a stable width (e.g. the player hand).            |
| `cdkNativeTransfer` | `boolean`                        | `false` | Opt-in to CDK's native cross-container transfer. Bypasses the enter predicate. Warning: re-introduces DOM-corruption-on-rejected-drop. |

### Outputs

| Output              | Payload               | Description                                                                  |
| ------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `cardSelected`      | `{ cardName, index }` | Single click on a legal card (standalone mode only, bypassed when IC active) |
| `cardConfirmed`     | `{ cardName, index }` | Double-click on a legal card (standalone mode only)                          |
| `selectedCards`     | `string[]`            | Current selection set after any change (standalone mode only)                |
| `cardsReordered`    | `(string \| null)[]`  | New card order after within-stack reorder.                                   |
| `cardDragStarted`   | `{ cardName, index }` | Card started being dragged out.                                              |
| `cardReceived`      | `{ cardName, index }` | Card from another stack dropped here (standalone mode only).                 |
| `cardDragCancelled` | `{ cardName, index }` | Drag cancelled (Escape or drop outside).                                     |

When a `stackId` is set and an `InteractionController` is available, click and double-click events route through the IC instead of emitting outputs. The outputs still fire in standalone mode (no IC) for backward compatibility.

### InteractionController Integration

When `stackId` is set and an IC is injected:

- **Click** → `ic.selectCard(stackId, card, maxSelections)` instead of emitting `cardSelected`
- **Double-click** → `ic.confirmCard(stackId, card)` instead of emitting `cardConfirmed`
- **Selection state** is read from `ic.selectedCards()` instead of the local `selection` signal
- **Highlighting** — the `highlighted` computed returns `true` when `ic.phase() === 'targeting'` and this stack's ID is in `ic.validTargets()`. This drives a CSS glow effect via the `stack-highlighted` host class and updates the ARIA label to include "valid drop target"
- **Stack click** — clicking a highlighted stack (or its empty placeholder) calls `ic.commitToTarget(stackId)`
- **Keyboard** — Enter/Space on a highlighted stack commits; Escape calls `ic.cancel()`

### Multi-Drag Preview

When dragging a card that's part of a multi-card selection, the drag preview shows all selected cards stacked together:

- The primary dragged card renders normally in the preview
- Additional selected cards render as offset overlays (each shifted by `+8px left, -8px top`) behind the primary card
- `getDragPreviewCompanions(primaryCard)` returns the other selected cards for the preview template
- All selected cards are hidden from their original positions during the drag via the `cardsHiddenDuringDrag` computed (a `Set<string>` of card names to hide)
- A `cdk-drag-placeholder` CSS rule hides CDK's default placeholder element

### Configuration Presets

The standard configurations used in the Sheepshead table:

**Player hand (IC-managed):**

```html
<app-card-stack
  stackId="hand"
  [cards]="myHand()"
  [spread]="0.5"
  [spreadAngle]="25"
  [autoScale]="true"
  [selectable]="true"
  [reorderable]="true"
  [draggable]="currentPhase() === 'play' || isBuryPhase()"
  [maxSelections]="isBuryPhase() ? buryCount() : 1"
  [legalCards]="legalCards()"
  (cardsReordered)="onHandReordered($event)"
/>
```

**Center trick pile (IC-managed, droppable):**

```html
<app-card-stack
  stackId="trick-pile"
  [cards]="trickCardNames()"
  [biasedPlacement]="true"
  [cardWidth]="100"
  [droppable]="true"
  [colorMap]="gameService.colorMap() ?? null"
  [playerIds]="trickPlayerIds()"
/>
```

**Bury target (IC-managed, droppable, empty):**

```html
<app-card-stack stackId="buried" [cards]="[]" [cardWidth]="100" [droppable]="true" />
```

**Opponent card backs (standalone, no IC):**

```html
<app-card-stack [cards]="cardBacks()" [spread]="0.4" [cardWidth]="40" />
```

### Visual States

Cards have three visual modes depending on the stack's configuration:

1. **Interactive + legal** — full color, `cursor: pointer`, lifts on hover, can be selected/confirmed
2. **Interactive + illegal** — dimmed via `filter: brightness(0.6) saturate(0.3)` (no transparency, so overlapping cards don't bleed through), `cursor: grab` if reorderable
3. **Non-interactive** — full color, `cursor: default`, no hover effect (used for center pile, opponent seats)

Additionally, when a stack is highlighted as a valid target:

4. **Highlighted** — `box-shadow: 0 0 8px 2px var(--color-primary-light)` and `border: 2px solid var(--color-primary-light)` on the `.card-stack-container`, with a 0.2s ease transition. The stack becomes focusable (`tabindex="0"`) and its ARIA label updates.

### Card Sizing

You only need to specify one of `cardWidth` or `cardHeight` — the other is derived from `cardAspectRatio` (default `7/5`, the standard poker card ratio of 2.5"×3.5"). If both are provided, they're used as-is and the aspect ratio is ignored. If neither is provided, the component falls back to 72 wide with height derived from the ratio.

For games with non-standard card assets (e.g. tarot cards, tiles), set `cardAspectRatio` to match the asset's height-to-width ratio and then size with a single dimension.

### Card Borders

Card borders are rendered via CSS on the rotation wrapper div inside each card-item. This div also provides the card's background color (`var(--color-card-bg)`) and rounded corners. The SVG card assets contain only the artwork (pips, face art, back pattern) on a transparent background — no background rect or border.

Two border modes:

- **Default** — `1px solid var(--color-card-border)`. The color is defined in `theme.css` (`#d4d4d4` light, `#525252` dark). Provides visual separation when cards overlap.
- **Selected** — `2px solid var(--color-primary-light)`. Applied when a card is in the selection set. Takes priority over the player halo.
- **Player halo** — `2px solid hsl(hue 75% var(--card-halo-lightness))` using the player's color from `colorMap`. The thicker border replaces the default, so there's no doubling. Lightness adapts to dark mode via the `--card-halo-lightness` CSS variable (66% light, 33% dark).

Border priority: selected > player halo > default. The `cardBorderValue(card, index)` method resolves this.

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
5. `SheepsheadTable.onHandReordered` updates a local `handOrder` signal
6. The `myHand` computed merges the local order with the server's hand (filtering removed cards, appending new ones)

The server never knows about hand reordering — it's purely a local UI preference.

### Selection Flow

**With InteractionController (stackId set):** Click routes to `ic.selectCard()`. Selection state lives in the IC's `selectedCards` signal. `CardStack.isSelected()` reads from the IC when available. Multi-select respects `maxSelections`. Double-click routes to `ic.confirmCard()` for the default-target shortcut.

**Standalone (no stackId):** Single-select (default): click selects, click again deselects. Double-click confirms (plays the card). Multi-select (`maxSelections > 1`): click toggles. Selection state is internal to the component. The parent reacts to `selectedCards` and `cardConfirmed` outputs.

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

**Solution:** Check `isInsideDropList(event.dropPoint)` before processing a same-container drop. If the point is outside the container's bounding rect, treat it as a cancel. The `isInsideDropList` method now checks both `card-stack-inner` and `card-stack-placeholder` elements to handle empty stacks.

### Enter Predicate: Rejecting Cross-Container Entry

When the `InteractionController` is managing interactions, CDK's default cross-container transfer behavior causes problems. CDK physically moves DOM elements between containers on enter, which leads to misplaced cards when a drag is cancelled (the card ends up in the wrong container's DOM with wrong transforms).

**Solution:** The `dropEnterPredicate` arrow function always returns `false` when an IC is present and the stack has a `stackId`. This prevents CDK from ever transferring DOM elements between IC-managed containers. Instead, cross-stack drops are handled entirely in `onDragEnded` via the IC's `resolveDropTarget` method, which performs bounding-rect hit-testing against registered `HTMLElement` entries.

A `cdkNativeTransfer` boolean input provides a per-stack opt-in to re-enable CDK's native cross-container transfers for games that need it. Enabling this re-introduces the DOM-corruption-on-rejected-drop problem, so the consuming game must handle position restoration.

```typescript
protected dropEnterPredicate = (_drag: CdkDrag): boolean => {
  if (this.cdkNativeTransfer()) return true; // Opt-in to CDK native behavior
  const ic = this.interactionController;
  if (ic && this.stackId()) return false; // IC manages all cross-stack interactions
  return true; // Standalone mode — allow
};
```

This is critical: without it, CDK's container-enter logic fights with the IC's coordination, causing cards to teleport or get stuck in wrong positions.

### onDragEnded Drop Resolution

Since the enter predicate blocks CDK's cross-container logic, `onDragEnded` delegates drop resolution to the IC's `resolveDropTarget` method:

1. Read `event.dropPoint` (screen coordinates where the pointer was released)
2. Call `ic.resolveDropTarget(sourceId, card, dropPoint)` — the IC performs bounding-rect hit-testing internally against its `HTMLElement` registry
3. If a result is returned, branch on `result.mode`:
   - `'commit'` → call `ic.commitToTarget(result.targetId)` (multi-card targeting drop)
   - `'confirm'` → call `ic.confirmCard(sourceId, card)` (single-card drag-to-play shortcut)
4. If `null`, the drop is treated as cancelled — execute the Position_Restore sequence

The `resolveDropTarget` method returns a `DropResolution` object (`{ targetId: string; mode: 'commit' | 'confirm' }`) or `null`. This keeps hit-testing on the IC (which owns the registry and state machine) and keeps CardStack game-agnostic — it never iterates over valid targets or accesses peer stacks' DOM elements.

Two drop scenarios handled by `resolveDropTarget`:

- **Multi-card drop during targeting phase**: If the dragged card is part of the IC selection and the pointer is over a valid target, returns `{ mode: 'commit' }`.
- **Single-card drag-to-play shortcut**: If the IC is idle with no selection, and the pointer is over the default target, returns `{ mode: 'confirm' }`.

### restoreCardPositions: Fixing CDK's DOM Reordering

After a rejected drop (enter predicate blocked the transfer, or the drop point wasn't over a valid target), CDK may have reordered DOM nodes within the source container. The card-item elements end up with wrong `transform` values because CDK's cleanup doesn't account for our absolute positioning.

**Solution:** A two-step restore:

1. `hideCardPositions()` — adds a `restoring-positions` CSS class to the host element. This class uses `visibility: hidden !important` on all card-items to hide CDK's incorrect positioning.
2. `restoreCardPositions()` (called in a `requestAnimationFrame`) — iterates all `[data-testid^="card-item-"]` elements, parses the index from the test ID, and re-applies the correct `transform` and `z-index` from `cardTranslate(index)` and `cardPositions()[index]`. Then removes the hiding class.

```css
:host(.restoring-positions) [data-testid^='card-item-'] {
  visibility: hidden !important;
}
```

The `!important` is necessary because CDK's cleanup may set inline visibility styles that would otherwise take precedence.

### dropListVersion Signal for Registry Reactivity

The static `dropListRegistry` (`Set<CdkDropList>`) tracks all active drop list instances. Previously, `connectedDropLists` re-evaluated by reading `this.cards()` as a dependency — a hack that happened to work because card changes often coincided with registry changes.

**Solution:** A static `dropListVersion` signal is bumped whenever a stack registers or unregisters its drop list. `connectedDropLists` reads this signal instead, giving it a proper reactive dependency that fires exactly when the registry changes.

```typescript
private static readonly dropListVersion = signal(0);

// In afterRenderEffect (register):
CardStack.dropListVersion.update((v) => v + 1);

// In connectedDropLists computed:
CardStack.dropListVersion(); // re-evaluate when any stack registers/unregisters
```

### Custom Drag Preview and Grab Offset

`matchSize` is a package deal: it gives correct grab-point positioning (CDK computes the pointer offset within the source element's bounding rect) AND sizes the preview to that bounding rect. Without `matchSize`, CDK forces the pickup offset to `{x: 0, y: 0}`, snapping the preview's top-left corner to the cursor. There is no CDK API to set one without the other.

The problem: `matchSize` uses `getBoundingClientRect()`, which returns the **axis-aligned bounding box**. For a rotated element, this is larger than the element's actual dimensions (a 72×101 card rotated 7.5° measures ~87×112). This causes visible extra space in the preview that cannot be overridden — CDK sets inline `width`/`height` on the preview's root element, which overrides Angular bindings.

**Solution:** Separate translate and rotate into different DOM levels. The card-item div (which CDK measures) gets only `transform: translate(...)`. A child wrapper div gets `transform: rotate(...)`. CDK now measures an unrotated element, so `matchSize` produces correct dimensions. The preview uses `matchSize` with `box-sizing: border-box` so the border is included in the matched dimensions.

```text
card-item div (cdkDrag) ← CDK measures this, translate only
  └─ rotation wrapper   ← visual rotation, border, background
       └─ button + card renderer
```

### Multi-Drag Preview Structure

The drag preview template now supports multi-card previews. The outer div uses `overflow:visible;position:relative` so magnetized cards can render outside the primary card's bounds:

```text
preview root (overflow:visible, position:relative)
  ├─ primary card (normal preview rendering)
  └─ @for magnetized cards
       └─ offset card (absolute, top: (j+1)*-8px, left: (j+1)*8px, z-index: -j-1)
```

Card renderer dimensions in the preview are reduced by 4px (`resolvedWidth() - 4`, `resolvedHeight() - 4`) to account for the 2px border on each side.

### Drag Preview Styling Gotchas

CDK extracts the preview template and attaches it to the document body as a popover element. This has several implications:

- **Tailwind utility classes may not apply** if they depend on parent context or scoped styles. Use inline `style` attributes for critical visual properties (background-color, border, overflow) to guarantee they survive extraction.
- **CSS custom variables** defined on `:root` or `@theme` do work in the preview since it's still in the same document. Use `var(--color-card-bg)` etc. in inline styles.
- **`filter` for muted/unplayable state** must be on the preview div itself, not inherited from a parent — the preview has no parent styling context from the original component tree.
- **`box-sizing: border-box`** is essential on the preview div when using `matchSize`, so the border doesn't add to the CDK-imposed dimensions.

### SVG Card Assets and CSS-Owned Card Shape

The card SVGs contain only artwork (pips, face art, back pattern) on a transparent background — no background rect or border. The card-item's inner wrapper div provides:

- `background-color: var(--color-card-bg)` — the card's white/dark fill
- `border` — thin default or thicker player-colored halo
- `border-radius` — computed from card width to match the original SVG corner ratio
- `overflow: hidden` — clips artwork to the rounded shape

This single-system approach (CSS owns the shape) eliminates aliasing artifacts that occurred when both the SVG and CSS tried to draw the same rounded-rect edge.

### Connected Drop Lists and the Static Registry

CardStack uses a static `Set<CdkDropList>` to track all active drop list instances across component instances. The `connectedDropLists` computed returns all other stacks' drop lists.

**Critical:** Only connect to other stacks when `draggable` or `droppable` is true. If a reorder-only stack (like the hand) connects to a display-only stack (like the center pile), CDK may route drops to the wrong container, causing cards to teleport.

### Scale Transform and CDK Coordinates

If the drop list container has a CSS `transform: scale()`, CDK's coordinate calculations use the scaled bounding rect (from `getBoundingClientRect`). The `findNearestIndex` method accounts for this by dividing the local coordinates by the scale factor.

### CardRenderer Host Display

`CardRenderer` uses `host: { class: 'block' }`. It was originally `inline-block`, which caused a baseline gap below the SVG — visible as extra space at the bottom of the card. Changing to `block` eliminates this.

### Card Tracking

The `@for` loop tracks cards by `card ?? $index` instead of just `$index`. This gives Angular stable identity for face-up cards across re-renders, preventing unnecessary DOM destruction/recreation when the card array is recomputed with the same cards in the same order.

## Backend: Target Query Endpoint

The target query system adds a read-only WebSocket round-trip:

- **Client → Server:** `game:query-targets` with `{ sessionId, sourceStackId, selectedCards, generation }`
- **Server → Client:** `game:valid-targets` with `{ generation, targets: string[] }`

The backend `GamePlugin` interface gains an optional `getValidTargets` method:

```typescript
getValidTargets?(
  config: TConfig,
  state: TState,
  userID: number,
  sourceStackId: string,
  selectedCards: string[],
): string[];
```

This is a pure read-only query — it must not modify state. If the plugin doesn't implement it, the server returns an empty targets array.

For Sheepshead, `getValidTargets` handles two cases:

- **Play phase**: if the selected cards are all legal plays and it's the player's turn, returns `["trick-pile"]`
- **Bury phase**: if the player is the picker and the selection count matches the bury count, returns `["buried"]`

## Adding a New Game's Table UI

1. Create a `GameTablePlugin` adapter in `apps/frontend/src/app/game/<game>/` — implement all methods including `buildMoveEvent` and `getDefaultTarget`
2. Create a game-specific table component (e.g. `<game>Table`) that uses `GameTableShell` for layout and `CardStack` instances with semantic `stackId` values
3. Register both in `game-registry.ts`:
   ```typescript
   GAME_TABLE_COMPONENTS['<game-type>'] = <Game>Table;
   GAME_TABLE_PLUGINS['<game-type>'] = <Game>TablePlugin;
   ```
4. Implement `getValidTargets` on the backend `GamePlugin` to support the target query flow
5. Assign `stackId` to each interactive `CardStack` — the IC uses these IDs to coordinate interactions
6. Set `draggable` on source stacks and `droppable` on target stacks to enable drag-and-drop
7. Use the configuration presets above as starting points, adjusting `spread`, `spreadAngle`, card dimensions, etc.
8. For games with a clear default target (e.g. one discard pile), implement `getDefaultTarget` to enable double-click shortcuts
