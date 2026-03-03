# Project Structure

CardQuorum is an Nx monorepo with 3 main layers: a frontend SPA, a backend API/WebSocket server, and shared libraries.

```sh
cardquorum/
├── apps/
│   ├── frontend/          # Angular 21 SPA
│   ├── frontend-e2e/      # Playwright e2e tests
│   ├── backend/           # NestJS + Fastify server
│   └── backend-e2e/       # Backend integration tests
├── libs/
│   ├── shared/            # Contracts, types, event constants
│   ├── engine/            # Room management, reusable game infra
│   └── games/
│       └── sheepshead/    # First game plugin (not yet implemented)
├── compose.dev.yml        # Postgres + Redis for local dev
├── .env.template          # Environment variable template
└── docs/                  # You are here
```

## Path Aliases

Defined in `tsconfig.base.json`, usable from any project:

| Alias                    | Points to                            |
| ------------------------ | ------------------------------------ |
| `@cardquorum/shared`     | `libs/shared/src/index.ts`           |
| `@cardquorum/engine`     | `libs/engine/src/index.ts`           |
| `@cardquorum/sheepshead` | `libs/games/sheepshead/src/index.ts` |

## Libraries

### `@cardquorum/shared`

Shared types and constants consumed by both frontend and backend. Contains no runtime logic — just interfaces and `as const` objects.

Key exports:

- `WS_EVENT` — client-to-server WebSocket event names (`room:join`, `room:leave`, `chat:send`)
- `WS_EMIT` — server-to-client event names (`room:joined`, `member:joined`, `member:left`, `chat:message`, `message:history`, `error`)
- Payload interfaces for every event (`JoinRoomPayload`, `ChatMessagePayload`, etc.)
- `Room` interface

### `@cardquorum/engine`

Pure TypeScript with no framework dependency. Provides reusable room/connection tracking that game plugins will build on.

Key exports:

- `RoomManager` — tracks rooms, members (by connection ID), and handles disconnect cleanup
- `RoomState` — the shape of a room's in-memory state

## Backend Modules

| Module          | Global? | Purpose                                                          |
| --------------- | ------- | ---------------------------------------------------------------- |
| `ConfigModule`  | Yes     | Validates env vars at startup (DATABASE_URL, REDIS_URL, etc.)    |
| `LoggerModule`  | Yes     | Structured logging via pino (pretty in dev, JSON in prod)        |
| `DrizzleModule` | Yes     | Provides `DRIZZLE` token — a typed Drizzle instance for Postgres |
| `RedisModule`   | Yes     | Provides `REDIS` token (ioredis) and `RedisPubSubService`        |
| `HealthModule`  | No      | `GET /api/healthz` — checks Postgres and Redis                   |
| `RoomModule`    | No      | Wraps engine's `RoomManager`, persists rooms to Postgres         |
| `ChatModule`    | No      | Chat gateway, message persistence, Redis pub/sub broadcast       |

## Frontend Structure

```sh
apps/frontend/src/app/
├── app.ts                     # Root component (just a <router-outlet>)
├── app.config.ts              # Providers (router)
├── app.routes.ts              # Lazy-loaded routes
├── services/
│   ├── websocket.service.ts   # Browser-native WebSocket wrapper (signal-based)
│   └── chat.service.ts        # Chat state management (signals)
└── chat/
    ├── chat-lobby.ts          # Room ID + nickname form
    ├── chat-room.ts           # Main chat view (sidebar + messages + input)
    ├── chat-message-list.ts   # Presentational message list (role="log")
    └── chat-member-list.ts    # Presentational member list
```

All components use `ChangeDetectionStrategy.OnPush` and are standalone (Angular 21 default).
