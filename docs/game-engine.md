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
  createInitialStore(config: TConfig, userIDs: number[]): TStore;
  getValidActions(config: TConfig, state: TState, userID: number): TEvent['type'][];
  applyEvent(config: TConfig, state: TState, store: TStore, event: TEvent): [TState, TStore];
  getPlayerView(config: TConfig, state: TState, userID: number): Partial<TState>;
  isGameOver(state: TState): boolean;
}
```

**`validateConfig`** — Type guard. Validates an unknown blob (from the client or DB) into a typed config. Called before session creation.

**`createInitialState` / `createInitialStore`** — Build the blank game. State and store start empty; the first event (typically a "deal" or "start") populates them.

**`getValidActions`** — Returns which event types a given player can perform right now. Used by the frontend to enable/disable UI controls and by the backend to reject invalid actions.

**`applyEvent`** — The core of the game. Takes current state + store + an event, returns new `[state, store]`. Must be pure — no mutation, no side effects. Throws on illegal moves.

**`getPlayerView`** — Derives a fog-of-war view for a specific player. Hides information they shouldn't see (other players' hands, face-down cards, hidden roles). The engine calls this before sending state to a client.

**`isGameOver`** — Returns whether the game has ended. The engine checks this after each event to decide whether to finalize the session.

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

| Column      | Content                                 |
| ----------- | --------------------------------------- |
| `game_type` | Matches `plugin.gameType`               |
| `config`    | JSONB — the validated `TConfig`         |
| `store`     | JSONB — the `TStore`, updated per event |
| `status`    | `'waiting'` / `'active'` / `'finished'` |

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

## Adding a New Game

### Directory Structure

```
libs/games/<game-name>/
├── src/
│   ├── index.ts              # Public API (re-exports)
│   └── lib/
│       ├── types.ts           # TConfig, TState, TStore, TEvent unions
│       ├── constants.ts       # Immutable data (deck, rule tables)
│       ├── <game>-plugin.ts   # GamePlugin implementation
│       └── *.spec.ts          # Tests
```

Game rules live in `libs/` — pure TypeScript, no framework dependencies, fully testable.

Infrastructure lives in `apps/backend/`:

```
apps/backend/src/<game-name>/
├── <game-name>.module.ts
├── <game-name>.service.ts     # Holds state, calls plugin methods
└── <game-name>.gateway.ts     # WebSocket event handlers
```

### Implementation Checklist

1. Define types: `TConfig`, `TState`, `TStore`, event union
2. Implement `GamePlugin` — start with `validateConfig`, `createInitialState/Store`, `isGameOver`
3. Build game logic as pure functions, called from `applyEvent`
4. Implement `getValidActions` and `getPlayerView`
5. Add event constants and payload types to `@cardquorum/shared`
6. Create backend gateway and service
7. Write tests — unit tests for pure logic, integration test for a full game flow
