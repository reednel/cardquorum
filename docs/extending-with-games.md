# Extending with Game Plugins

The chat feature establishes patterns that game plugins will reuse. This doc explains those patterns and how a new game would integrate.

## Patterns Established

### 1. Contracts First (`@cardquorum/shared`)

Every WebSocket interaction starts with a type definition:

- **Event constants** (`WS_EVENT` / `WS_EMIT`) — the string names on the wire
- **Payload interfaces** — fully typed request and response shapes

A game plugin would add its own event constants (e.g. `GAME_EVENT.PLAY_CARD`, `GAME_EMIT.STATE_UPDATE`) and payload types to the shared library.

### 2. Engine RoomManager (`@cardquorum/engine`)

`RoomManager` is a pure TypeScript class that tracks:

- Which rooms exist (by ID)
- Which connections are in each room (by connection ID → `UserIdentity`)
- Which rooms each connection belongs to (for disconnect cleanup)

Games don't subclass `RoomManager` — they compose with it. A game service would hold its own game state (hands, scores, turn order) alongside the room's member tracking.

### 3. Gateway Pattern

The `ChatGateway` demonstrates the NestJS WebSocket gateway pattern:

- `@WebSocketGateway({ path: '/ws' })` — registers on the shared WS endpoint
- `@SubscribeMessage(WS_EVENT.X)` — handles a specific event
- Connection tracking via `handleConnection` / `handleDisconnect`
- Broadcasting to room members via the `RoomManager`

A game gateway would follow the same pattern, handling game-specific events like `game:start`, `game:play-card`, etc.

### 4. Frontend WebSocketService

The browser-side `WebSocketService` is game-agnostic:

- `connect(url)` / `disconnect()`
- `send(event, data)` — sends a typed event
- `on<T>(event, handler)` — subscribes to an event, returns unsubscribe fn
- `connected` signal for reactive UI state

Game components use this same service — no need for a separate WebSocket connection per game.

## How a Game Plugin Would Look

```sh
libs/games/sheepshead/
├── src/
│   ├── index.ts           # Public API
│   └── lib/
│       ├── types.ts       # Game-specific types (Hand, Card, Trick, etc.)
│       ├── rules.ts       # Pure functions: valid moves, scoring, state transitions
│       └── rules.spec.ts  # Property-based tests with fast-check

libs/shared/src/lib/
├── sheepshead-events.ts   # SHEEPSHEAD_EVENT / SHEEPSHEAD_EMIT constants
└── sheepshead-types.ts    # Payload interfaces

apps/backend/src/sheepshead/
├── sheepshead.module.ts
├── sheepshead.service.ts  # Game state, uses RoomManager + rules lib
└── sheepshead.gateway.ts  # Handles game events, broadcasts state
```

The key principle: **game rules live in `libs/`** (pure, testable, no framework dependency), while **the gateway and service live in `apps/backend/`** (NestJS infrastructure).
