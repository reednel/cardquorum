# Game Engine

How CardQuorum models, orchestrates, and persists games. This doc covers the generic framework — see game-specific docs (e.g. [Sheepshead](design/sheepshead.md)) for rule details.

## Core Concepts

### State vs Store

Every game maintains two representations of its data:

**State** is the full in-memory model during active play. It contains everything the game logic needs to evaluate moves and advance the game: player hands, whose turn it is, the current phase, in-progress tricks, etc. State is transient — it exists only while the game is being played and is never written to the database directly.

**Store** is the permanent record committed to `game_sessions.store` (JSONB column). It captures what happened: completed tricks, final roles, scores, any data needed for post-game review. It omits transient details like current hands or active player.

Both are defined as generic type parameters on `GamePlugin`, so each game decides what goes where.

### Config vs State

**Config** is the set of immutable settings chosen before a game starts (player count, rule variants, house rules). It's stored in `game_sessions.config` and never changes during play.

**State** changes on every event. Config determines _which rules apply_; state tracks _progress through those rules_.

### Player Identification

Players are identified by `UserID` (number, matching `users.id`) throughout the engine and game logic. The engine passes `userIDs: number[]` when creating a game — the plugin decides what ordering means (e.g. dealer position).

## The GamePlugin Interface

Every game implements `GamePlugin<TConfig, TState, TStore, TEvent>` from `@cardquorum/engine`:

```typescript
interface GamePlugin<TConfig, TState, TStore, TEvent extends GameEventBase> {
  readonly gameType: string;

  validateConfig(config: unknown): config is TConfig;
  createInitialState(config: TConfig, userIDs: number[]): TState;
  getValidActions(config: TConfig, state: TState, userID: number): TEvent['type'][];
  applyEvent(config: TConfig, state: TState, event: TEvent): TState;
  getPlayerView(config: TConfig, state: TState, userID: number): Partial<TState>;
  isGameOver(state: TState): boolean;
  buildStore(config: TConfig, state: TState): TStore;
}
```

**`validateConfig`** — Type guard. Validates an unknown blob (from the client or DB) into a typed config. Called before session creation.

**`createInitialState`** — Builds the blank game state. State starts empty; the first event (typically a "deal" or "start") populates it.

**`getValidActions`** — Returns which event types a given player can perform right now. The engine passes config so the plugin stays stateless. Used by the frontend to enable/disable UI controls and by the backend to reject invalid actions.

**`applyEvent`** — The core of the game. Takes config + current state + an event, returns the new state. Must be pure — no mutation, no side effects, no instance state. Throws on illegal moves.

**`getPlayerView`** — Derives a fog-of-war view for a specific player. Hides information they shouldn't see (other players' hands, face-down cards, hidden roles). The engine passes config and calls this before sending state to a client.

**`isGameOver`** — Returns whether the game has ended. The engine checks this after each event to decide whether to finalize the session.

**`buildStore`** — Constructs the permanent store record from a state snapshot. Called by the engine after the final `applyEvent` (when `isGameOver` returns true), or when a game is terminated early. This deferred construction means store data doesn't need to be maintained incrementally during play.

### Events

Events implement `GameEventBase`:

```typescript
interface GameEventBase {
  type: string;
  userID?: number; // omitted for system events (deal, score)
  payload?: unknown;
}
```

Each game defines a union of specific event types. The `type` field drives dispatch in `applyEvent`.

## Integration Patterns

### Persistence

A game session maps to one row in `game_sessions`:

| Column      | Content                                                  |
| ----------- | -------------------------------------------------------- |
| `game_type` | Matches `plugin.gameType`                                |
| `config`    | JSONB — the validated `TConfig`                          |
| `store`     | JSONB — the `TStore`, built at game end via `buildStore` |
| `status`    | `'waiting'` / `'active'` / `'finished'`                  |

State is not persisted. On reconnect, the engine holds state in memory (or reconstructs it if needed).

### WebSocket Gateway

The `ChatGateway` establishes the pattern game gateways follow:

- `@WebSocketGateway({ path: '/ws' })` — all gateways share one WebSocket endpoint
- `@SubscribeMessage(EVENT_NAME)` — handles a specific event type
- Connection tracking via `handleConnection` / `handleDisconnect`
- Broadcasting to room members via `RoomManager`

A game gateway receives player actions, calls `plugin.applyEvent`, then broadcasts `plugin.getPlayerView` to each player in the room.

### RoomManager

`RoomManager` (from `@cardquorum/engine`) tracks which connections are in which rooms. Games compose with it — they don't subclass it. A game service holds its own game state alongside the room's member tracking.

### Frontend WebSocketService

The browser-side `WebSocketService` is game-agnostic:

- `send(event, data)` — sends a typed event
- `on<T>(event, handler)` — subscribes, returns unsubscribe function
- `connected` signal for reactive UI

Game components use this same service. No separate WebSocket connection per game.

## Game Config Plugin System

Separate from the runtime `GamePlugin`, each game exports a `GameConfigPlugin` that tells the frontend how to render game configuration UI. This is defined in `@cardquorum/engine` alongside the runtime plugin types. For a deep dive on the config/preset data flow, see [game-config-and-presets.md](game-config-and-presets.md).

### Types (from `@cardquorum/engine`)

```typescript
type FieldMode = 'hidden' | 'locked' | 'editable';

interface ConfigFieldDef<T> {
  readonly value: T;
  readonly mode: FieldMode;
}

interface SelectFieldDef<T> extends ConfigFieldDef<T> {
  readonly options: T[];
}

interface FieldMetadata {
  readonly displayName: string;
  readonly description: string;
  readonly renderType: 'boolean' | 'select' | 'number' | 'nullable-number' | 'hidden-array';
}

type FieldRegistry<K extends string = string> = Readonly<Record<K, FieldMetadata>>;

interface GenericConfigPreset {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly allowedPlayerCounts: number[];
  readonly fields: Readonly<Record<string, ConfigFieldDef<unknown>>>;
}

interface GameConfigPlugin<K extends string = string> {
  readonly label: string;
  readonly fieldRegistry: FieldRegistry<K>;
  readonly presets: readonly GenericConfigPreset[];
  readonly configSchema: z.ZodType;
}
```

### How It Works

Each game library exports a `GameConfigPlugin` that bundles four things:

1. A `label` (display name for the game)
2. A `FieldRegistry` mapping each config field key to UI metadata (display name, tooltip description, render type)
3. An array of fully-explicit `GenericConfigPreset` objects (each preset specifies every field's value, mode, and options)
4. A Zod `configSchema` for validating flat config values

The frontend's `GameRegistry` maps game identifiers to `GameConfigPlugin` instances. The `RoomGameTab` component reads a plugin, lets the user pick a preset, and builds field entries by joining preset field data with registry metadata. No game-specific rendering code exists in the frontend — it's all driven by the plugin.

### Key Design Decisions

**Metadata-only registry.** The `FieldRegistry` contains only UI metadata (display name, description, render type). It does not define default values, modes, or options. This keeps the registry simple and avoids any merge/override complexity.

**Fully explicit presets.** Every preset lists all fields with their complete definition (value + mode + options). No inheritance, no defaults, no `resolvePreset` utility. This makes presets self-contained and easy to reason about.

**Separate from runtime plugin.** `GameConfigPlugin` is intentionally separate from `GamePlugin`. The runtime plugin handles game logic (state, events, validation). The config plugin handles UI rendering (labels, tooltips, field types). They share a Zod schema but otherwise have no coupling.

### Frontend Rendering

The `RoomGameTab` component uses `buildFieldEntries(preset, registry)` to produce an array of `FieldEntry` objects for rendering. Each entry combines the preset's field data (value, mode, options) with the registry's metadata (displayName, description, renderType). The template uses `@switch` on `renderType` to render the appropriate control (checkbox, select, number input, etc.).

Fields with `mode: 'hidden'` are filtered out. Fields with `mode: 'locked'` appear in a read-only "Fixed Rules" section. Fields with `mode: 'editable'` appear in the "House Rules" section with interactive controls.

## Adding a New Game

### Directory Structure

```text
libs/games/<game-name>/
├── src/
│   ├── index.ts              # Public API (re-exports)
│   └── lib/
│       ├── types.ts           # Game-logic types (state, events, cards)
│       ├── constants.ts       # Game-logic constants (deck, rule tables)
│       ├── config.ts          # Config schemas, types, field registry, presets, GameConfigPlugin
│       ├── <game>-plugin.ts   # GamePlugin implementation (runtime logic)
│       └── *.spec.ts          # Tests
```

Game rules live in `libs/` — pure TypeScript, no framework dependencies, fully testable.

Infrastructure lives in `apps/backend/`:

```text
apps/backend/src/<game-name>/
├── <game-name>.module.ts
├── <game-name>.service.ts     # Holds state, calls plugin methods
└── <game-name>.gateway.ts     # WebSocket event handlers
```

### Implementation Checklist

1. Define game-logic types in `types.ts`: `TState`, `TStore`, event union, card/piece models
2. Define game-logic constants in `constants.ts`: deck, rule tables, scoring tables
3. Define config in `config.ts`: Zod schema, config type, field key union, `FieldRegistry`, presets, `GameConfigPlugin`
4. Implement `GamePlugin` in `<game>-plugin.ts` — `validateConfig`, `createInitialState`, `applyEvent`, etc.
5. Build game logic as pure functions, called from `applyEvent`
6. Add event constants and payload types to `@cardquorum/shared`
7. Create backend gateway and service
8. Write tests — unit tests for pure logic, integration test for a full game flow
