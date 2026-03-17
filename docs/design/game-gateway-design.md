# Game Gateway & WebSocket Contracts Design

How CardQuorum bridges the pure game logic (plugins) to real-time multiplayer via WebSockets. Covers the shared event contracts, the backend gateway and service, and the full session lifecycle.

## Shared WebSocket Event Contracts

Added to `libs/shared` alongside the existing chat events.

### Event Constants

```typescript
// Client → Server
GAME_CREATE: 'game:create';
GAME_START: 'game:start';
GAME_ACTION: 'game:action';
GAME_REJOIN: 'game:rejoin';
GAME_CANCEL: 'game:cancel';

// Server → Client
GAME_CREATED: 'game:created';
GAME_STARTED: 'game:started';
GAME_STATE_UPDATE: 'game:state-update';
GAME_OVER: 'game:over';
GAME_ERROR: 'game:error';
GAME_CANCELLED: 'game:cancelled';
```

### Payload Types

| Type                     | Direction       | Fields                                                           |
| ------------------------ | --------------- | ---------------------------------------------------------------- |
| `GameCreatePayload`      | Client → Server | `roomId`, `gameType`, `config` (unknown — validated server-side) |
| `GameStartPayload`       | Client → Server | `sessionId`                                                      |
| `GameActionPayload`      | Client → Server | `sessionId`, `action: { type: string, payload?: unknown }`       |
| `GameRejoinPayload`      | Client → Server | `roomId`                                                         |
| `GameCancelPayload`      | Client → Server | `sessionId`                                                      |
| `GameCreatedPayload`     | Server → Client | `sessionId`, `gameType`, `config` (validated)                    |
| `GameStartedPayload`     | Server → Client | `sessionId`, `state` (player view from `getPlayerView`)          |
| `GameStateUpdatePayload` | Server → Client | `sessionId`, `state` (player view)                               |
| `GameOverPayload`        | Server → Client | `sessionId`, `store` (built store — final results)               |
| `GameErrorPayload`       | Server → Client | `sessionId?`, `message`                                          |
| `GameCancelledPayload`   | Server → Client | `sessionId`                                                      |

The `action` field in `GameActionPayload` mirrors `GameEventBase` but without `userID` — the server injects that from the authenticated connection. The `state` and `store` fields are typed as `unknown` at the shared contract level; the frontend casts based on `gameType`.

## Backend Architecture

### Directory Structure

```sh
apps/backend/src/ws/
├── ws-connection.service.ts  # Shared client tracking singleton
├── ws.gateway.ts             # Connection lifecycle (auth + track/untrack)
├── ws-validation.pipe.ts     # WsException-based ValidationPipe for DTOs
└── ws.module.ts              # Global module for WsConnectionService + WsGateway

apps/backend/src/room/
├── room.module.ts            # Provides RoomGateway + RoomController + RoomService
├── room.controller.ts        # REST CRUD endpoints (POST/GET/PATCH/DELETE)
├── room.gateway.ts           # room:join, room:leave, disconnect cleanup
├── room.dto.ts               # class-validator DTOs for WS + REST payloads
└── room.service.ts           # CRUD, RoomManager, broadcastToRoom helper

apps/backend/src/game/
├── game.module.ts            # Provides GameGateway + GameService
├── game.gateway.ts           # WebSocket event handlers for game lifecycle
├── game.dto.ts               # class-validator DTOs for game payloads
└── game.service.ts           # Holds state, orchestrates plugin calls

apps/backend/src/chat/
├── chat.module.ts            # Provides ChatGateway + ChatService
├── chat.gateway.ts           # chat:send only
├── chat.dto.ts               # class-validator DTO for SendMessage
└── chat.service.ts           # Message persistence
```

One game-agnostic module for all game types. The gateway and service dispatch to plugins — game-specific logic stays in `libs/games/<game>/`.

Room management is separated from chat — `RoomGateway` handles room join/leave and disconnect cleanup, while `ChatGateway` handles only message sending. `RoomService.broadcastToRoom()` is the shared broadcast helper used by all gateways.

### WsGateway

Owns the WebSocket connection lifecycle. Implements `OnGatewayConnection` and `OnGatewayDisconnect`:

- `handleConnection` — authenticates via `WsAuthGuard`, registers client via `WsConnectionService.trackClient()`. Rejects with `4001 Unauthorized` on auth failure and `4002 Too many connections` if the per-user limit is exceeded.
- `handleDisconnect` — calls `WsConnectionService.notifyDisconnect()` which fires all registered listeners before untracking the client.

### WsConnectionService

Shared singleton (`@Global()`) that all gateways and services use for client tracking. Typed with `WebSocket` from the `ws` package (not `any`).

- `trackClient(ws, identity)` — registers a WebSocket, assigns a stable `conn-{id}`, returns `TrackedClient | null` (null if user exceeds `MAX_CONNECTIONS_PER_USER`)
- `notifyDisconnect(ws)` — fires all registered disconnect listeners, then removes the client from both maps. Listeners receive the `TrackedClient` while it's still tracked, solving the cross-gateway ordering problem.
- `onDisconnect(listener)` — registers a callback for disconnect events. ChatGateway and GameGateway register listeners in `onModuleInit`.
- `untrackClient(ws)` — direct removal (used for tests; production flow uses `notifyDisconnect`)
- `getTracked(ws)` — lookup by WebSocket reference
- `getTrackedById(connId)` — reverse lookup by connection ID (used for O(room_size) broadcasting)
- `getClientsByUserId(userId)` — all connections for a user (multi-tab support)

### GameService

Responsibilities:

- Maintains `Map<number, ActiveGame>` of in-memory sessions (keyed by `sessionId`)
- Plugin registry: `Map<string, GamePlugin>` to resolve `gameType` to the right plugin
- `createSession(roomId, gameType, config, createdBy)` — validates config via plugin, persists to DB, adds to in-memory map with `status: 'waiting'`. Eagerly reserves `roomToSession` before the async DB call to prevent race conditions.
- `startSession(sessionId, requestedBy)` — verifies creator, collects room members (deduplicated by userId), calls `createInitialState`, flips status to `'active'`, returns initial player views
- `applyAction(sessionId, userID, action)` — validates via `getValidActions`, calls `applyEvent`, checks `isGameOver`, returns player views (and store if game over). On game-over, persists to DB before removing from in-memory maps.
- `cancelSession(sessionId, requestedBy)` — cancels a waiting session, removes from maps
- `cleanupDisconnectedCreator(userId)` — cancels all waiting sessions created by a user (called on disconnect when no remaining connections)
- `getPlayerView(sessionId, userID)` — returns null if user is not a player
- `getPlayerViewByRoom(roomId, userID)` — for reconnection

**Plugin registry** (hardcoded for now):

```typescript
private readonly plugins = new Map<string, GamePlugin>([
  ['sheepshead', SheepsheadPlugin],
]);
```

When a second game is added, refactor to a registration pattern.

**ActiveGame shape:**

```ts
interface ActiveGame {
  sessionId: number;
  roomId: number;
  gameType: string;
  config: unknown; // validated TConfig, stored as unknown since the service is game-agnostic
  state: unknown | null; // TState while active, null while status is 'waiting'
  playerIDs: number[];
  playerCount: number; // from config, stored here so the service doesn't reach into game-specific config
  createdBy: number; // userID of the creator, for start/cancel authorization
  status: 'waiting' | 'active';
  createdAt: number; // Date.now() — used for abandoned session sweep
}
```

`state` is `null` until `game:start`. `config` and `state` are typed as `unknown` at the service level — the plugin handles type safety internally. `playerCount` is extracted from the config at creation time so the game-agnostic service can validate player counts without knowing game-specific config shapes.

**Abandoned session sweep:** A `setInterval` runs every 5 minutes and cancels any `'waiting'` sessions older than 30 minutes (`WAITING_SESSION_TTL_MS`). The timer is cleared in `onModuleDestroy`.

The service also maintains a reverse lookup `Map<number, number>` (`roomId → sessionId`) for reconnection — when a player rejoins a room, the service can quickly find the active game for that room.

### RoomGateway

Responsibilities:

- `@SubscribeMessage` handlers for `room:join` and `room:leave`
- Registers disconnect listener via `onModuleInit` — broadcasts room departures when a client disconnects
- On join: validates room exists, adds member, sends `ROOM_JOINED` (members) + `MESSAGE_HISTORY` (recent messages), broadcasts `MEMBER_JOINED` to others
- On leave: removes member, broadcasts `MEMBER_LEFT`
- Injects `MessageRepository` directly for message history (avoids circular dependency with ChatModule)

### RoomController (REST)

HTTP endpoints for room CRUD, all guarded by `HttpAuthGuard`:

| Method   | Path             | Auth  | Description                                          |
| -------- | ---------------- | ----- | ---------------------------------------------------- |
| `POST`   | `/api/rooms`     | Any   | Create a room (caller becomes owner)                 |
| `GET`    | `/api/rooms`     | Any   | List public rooms (includes online counts)           |
| `GET`    | `/api/rooms/:id` | Any   | Get room details                                     |
| `PATCH`  | `/api/rooms/:id` | Owner | Update room name/visibility                          |
| `DELETE` | `/api/rooms/:id` | Owner | Delete room (boots WS members, cancels active games) |

Room names are unique. Visibility options: `public`, `friends-only`, `invite-only`.

### RoomService

- Holds the `RoomManager` instance (in-memory room membership)
- CRUD operations: `findById`, `findAll`, `create`, `update`, `delete`
- `delete` broadcasts `ROOM_DELETED` to all connected members and removes them from the `RoomManager` before deleting from DB
- `getOnlineCount(roomId)` — deduplicated unique user count from in-memory membership
- `roomExists(roomId)` — checks the DB via `RoomRepository`
- `broadcastToRoom(roomId, event, data, excludeConnId?)` — shared broadcast helper used by all gateways. Iterates room members, looks up tracked clients via `WsConnectionService`, sends with try/catch safety.

### GameGateway

Responsibilities:

- `@SubscribeMessage` handlers for `game:create`, `game:start`, `game:action`, `game:cancel`, `game:rejoin`
- Registers disconnect listener via `onModuleInit` — cleans up waiting sessions when the creator's last connection drops
- Extracts `userID` from tracked connection
- Calls GameService methods
- Sends **per-player** fog-of-war views via `sendPlayerViews` (each player gets their own `getPlayerView` result)
- Uses `roomService.broadcastToRoom()` for room-wide messages (`game:created`, `game:cancelled`)
- Sends `game:error` for rejected actions (generic messages only)

### ChatGateway

Handles only `chat:send`. Persists the message via `ChatService`, then broadcasts to the room via `roomService.broadcastToRoom()`.

### Connection Lifecycle

`WsGateway` owns the full connection lifecycle — authentication via `WsAuthGuard` on connect, and `notifyDisconnect` on disconnect. Domain-specific gateways register disconnect listeners via `WsConnectionService.onDisconnect()` in their `onModuleInit`:

- **RoomGateway listener** — broadcasts room departures
- **GameGateway listener** — checks if the disconnecting user has remaining connections; if not, cancels their waiting game sessions

Listeners fire before the client is untracked, so they can still look up the client and its connections. This eliminates the NestJS gateway ordering problem.

### Reconnection

No special handling. When a player reconnects:

1. They rejoin the room via existing `room:join` flow
2. Client sends `game:rejoin` with `{ roomId }`
3. Gateway calls `gameService.getPlayerViewByRoom(roomId, userId)`
4. If an active game exists and the user is a player, sends `game:state-update` with their current `getPlayerView`

State is in-memory only; server restart loses active games.

## Authorization, Validation, and Security

### Who Can Do What

| Action        | Allowed by                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `game:create` | Any room member                                                         |
| `game:start`  | The session creator, must still be in the room                          |
| `game:action` | Only players in `playerIDs` with a valid action via `getValidActions`   |
| `game:cancel` | The session creator, must still be in the room (only while `'waiting'`) |
| `game:rejoin` | Only players in `playerIDs`                                             |

### Input Validation

All client→server payloads are validated via `class-validator` DTOs and `WsValidationPipe`:

- Integer IDs must be `@IsInt() @Min(1)`
- String fields have `@MaxLength` constraints (game type: 50, chat content: 10,000)
- Nested objects validated via `@ValidateNested()` with `@Type()`
- `whitelist: true` strips unknown properties; `forbidNonWhitelisted: true` rejects them
- Validation failures throw `WsException` with joined constraint messages

Shared interfaces in `libs/shared` remain as contracts; DTO classes live in the backend and `implements` the corresponding interface.

### Error Handling

Gateway catch blocks log the full error server-side and send generic messages to clients. Internal details (session IDs, user IDs, game state) are never exposed in error payloads. All `ws.send()` calls are wrapped in try/catch to prevent one dead connection from crashing the broadcast loop.

### Connection Limits

- Per-user connection cap: `MAX_CONNECTIONS_PER_USER = 5` (enforced in `WsConnectionService.trackClient`)
- `JWT_SECRET` must be ≥ 32 characters (enforced in `BasicAuthStrategy` constructor)

### Validation Flow for `game:create`

1. Is the sender a member of the room? If not → error
2. Is there already an active or waiting game session for this room? If so → error (one active game per room)
3. Is `gameType` in the plugin registry? If not → error
4. Does `plugin.validateConfig(config)` pass? If not → error
5. Reserve room slot in `roomToSession`, create DB row, add to in-memory map, broadcast `game:created`

### Validation Flow for `game:action`

1. Is `sessionId` in the active games map? If not → error
2. Is the session `'active'`? If not → error
3. Is `userID` in `playerIDs`? If not → error
4. Is `action.type` in `plugin.getValidActions(config, state, userID)`? If not → error
5. Construct event: `{ type: action.type, userID, payload: action.payload }`
6. Call `plugin.applyEvent(config, state, event)` — if it throws → error
7. Update state, check `isGameOver`, broadcast views

Note on system-like events (e.g. Sheepshead's `game_scored`): these follow the same flow. The server injects `userID` from the connection; the plugin handler may ignore it. `getValidActions` controls who can trigger them — for `game_scored`, any player can trigger it during the `'score'` phase since the server computes scores internally.

### `game:start` Validation

1. Is the session in `'waiting'` status?
2. Is the sender the `createdBy` user?
3. Collect room members as `playerIDs`, deduplicated by `userId` (a user with multiple connections counts as one player). If count doesn't match `playerCount` → error.

## Event Flow — Full Lifecycle

```md
1. Players are already in a room (existing room:join flow)

2. game:create
   Client sends: { roomId, gameType, config }
   Server: validates config via plugin, creates DB row (status: 'waiting'),
   adds to in-memory map
   Server broadcasts to room: game:created { sessionId, gameType, config }

3. game:start
   Client sends: { sessionId }
   Server: verifies sender is creator, grabs room members as playerIDs,
   validates player count against config,
   calls createInitialState(config, playerIDs),
   updates DB status to 'active'
   Server sends to each player: game:started { sessionId, state: <their view> }

4. game:action (deal)
   Dealer sends: { sessionId, action: { type: 'deal' } }
   Server: validates, applies event, broadcasts per-player views
   Server sends to each player: game:state-update { sessionId, state: <their view> }

5. game:action (pick/pass/bury/call/play/crack/blitz — repeats)
   Same loop: validate → applyEvent → broadcast views

6. game:action (game_scored — finalizes the game)
   After the last trick, the phase transitions to 'score'. Any player sends:
   { sessionId, action: { type: 'game_scored' } }
   Server: computes scores internally via the plugin, applies event
   isGameOver returns true → calls buildStore, persists to DB,
   updates status to 'finished', removes from in-memory map
   Server sends to each player: game:over { sessionId, store: <final results> }

7. Back to step 2 — leader can create a new game in the same room

Cancellation:
Creator sends: game:cancel { sessionId }
Server: verifies creator, updates DB status to 'cancelled',
removes from in-memory map
Server broadcasts to room: game:cancelled { sessionId }

Also triggered automatically when the creator disconnects (last connection)
and the session is still in 'waiting' status.
```

## Out of Scope

- **Room ownership transfer** — the room creator is the permanent owner; no transfer mechanism yet
- **Player rotation** — all room members are players; rotation comes later
- **`game:join`** — skipped; players are room members
- **Event sourcing / replay** — state is in-memory only; server restart loses active games
- **Game pause on disconnect** — reconnecting players just get the latest view
- **Spectator mode** — no observers
- **Turn timers** — no timeout forcing a move
