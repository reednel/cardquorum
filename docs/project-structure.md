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
│       └── sheepshead/    # Sheepshead game plugin (complete)
├── compose.dev.yml        # Postgres for local dev
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

- `WS_EVENT` — client-to-server WebSocket event names (`room:join`, `room:leave`, `chat:send`, game events)
- `WS_EMIT` — server-to-client event names (`room:joined`, `member:joined`, `member:left`, `member:kicked`, `chat:message`, `message:history`, `room:deleted`, game events, `error`)
- Payload interfaces for every event (`JoinRoomPayload`, `ChatMessagePayload`, `RoomDeletedPayload`, `MemberKickedPayload`, game payloads, etc.)
- Room types: `Room`, `RoomResponse`, `RoomVisibility`, `CreateRoomRequest`, `UpdateRoomRequest`, `RoomInviteResponse`, `RoomBanResponse`, `InviteUserRequest`, `BanUserRequest`
- Auth types: `AuthStrategy`, `LoginRequest`, `RegisterRequest`, `StrategiesResponse`, `UserIdentity`
- Game types: `GameType`, `GameSessionStatus`

### `@cardquorum/engine`

Pure TypeScript with no framework dependency. Provides reusable room/connection tracking and the generic game config plugin contract.

Key exports:

- `RoomManager` — tracks rooms, members (by connection ID), and handles disconnect cleanup
- `RoomState` — the shape of a room's in-memory state
- `GamePlugin`, `GameEventBase` — runtime game plugin interface and event base type
- `GameConfigPlugin` — config-side plugin contract (label, field registry, presets, validation schema)
- `FieldMetadata`, `FieldRegistry`, `GenericConfigPreset` — generic config types consumed by the frontend
- `FieldMode`, `ConfigFieldDef`, `SelectFieldDef` — field definition types used in presets

## Backend Modules

| Module          | Global? | Purpose                                                                 |
| --------------- | ------- | ----------------------------------------------------------------------- |
| `ConfigModule`  | Yes     | Validates env vars at startup (DATABASE_URL, etc.)                      |
| `LoggerModule`  | Yes     | Structured logging via pino (pretty in dev, JSON in prod)               |
| `DrizzleModule` | Yes     | Provides `DRIZZLE` token — a typed Drizzle instance for Postgres        |
| `HealthModule`  | No      | `GET /api/healthz` — checks Postgres                                    |
| `AuthModule`    | No      | Register/login, session management, HTTP + WS auth guards               |
| `RoomModule`    | No      | Room CRUD REST API, invite/ban management, wraps engine's `RoomManager` |
| `ChatModule`    | No      | Chat gateway, message persistence                                       |
| `WsModule`      | No      | WebSocket connection lifecycle, validation pipe                         |
| `GameModule`    | No      | Game session lifecycle, game gateway                                    |

## Frontend Structure

```sh
apps/frontend/src/app/
├── app.ts                     # Root component (just a <router-outlet>)
├── app.config.ts              # Providers (router, HTTP interceptors, APP_INITIALIZER for session hydration)
├── app.routes.ts              # Lazy-loaded routes (/login, /register, /rooms, /rooms/:roomId)
├── auth/
│   ├── auth.guard.ts          # Route guard — redirects to /login if unauthenticated
│   ├── auth.interceptor.ts    # HTTP interceptor — handles 401 redirect (cookies sent automatically)
│   ├── login.ts               # Login page
│   └── register.ts            # Registration page
├── shell/
│   └── app-shell.ts           # Authenticated layout wrapper with nav bar + theme toggle
├── services/
│   ├── auth.service.ts        # Session-based auth, user identity hydration (signals)
│   ├── websocket.service.ts   # Browser-native WebSocket wrapper (signal-based)
│   ├── chat.service.ts        # Chat state management (signals)
│   ├── room.service.ts        # Room REST API wrapper (signals)
│   └── theme.service.ts       # Light/dark theme toggle (persisted to localStorage)
├── room-listings/
│   ├── memberships-page.ts    # Memberships page — rooms the user belongs to
│   ├── discover-page.ts       # Discover page — find and join new rooms
│   ├── room-table.ts          # Shared room table component
│   ├── details-popover.ts     # Hover popover for room details
│   ├── pagination.ts          # Pagination controls for public rooms
│   ├── room-listings.service.ts # HTTP service for memberships/discover endpoints
│   ├── create-room-modal.ts   # Modal form for creating rooms
│   └── room-config-modal.ts   # Modal for editing/deleting owned rooms
├── room/
│   ├── room-view.ts           # In-room view (sidebar + chat + member list)
│   ├── room-chat-tab.ts       # Chat tab inside room view
│   ├── room-members-tab.ts    # Members tab inside room view
│   ├── room-game-tab.ts       # Game tab inside room view
│   ├── room.service.ts        # Room REST API wrapper (signals)
│   ├── roster.service.ts      # Roster state management (signals)
│   └── overflow-menu.ts       # Overflow menu for member actions
└── chat/
    ├── chat-message-list.ts   # Presentational message list (role="log")
    └── chat-member-list.ts    # Presentational member list
```

All components use `ChangeDetectionStrategy.OnPush` and are standalone (Angular default).

### Route Structure

| Path             | Component         | Auth required | Description                   |
| ---------------- | ----------------- | ------------- | ----------------------------- |
| `/login`         | `Login`           | No            | Login form                    |
| `/register`      | `Register`        | No            | Registration form             |
| `/`              | `AppShell`        | Yes           | Redirects to `/memberships`   |
| `/memberships`   | `MembershipsPage` | Yes           | Rooms the user belongs to     |
| `/discover`      | `DiscoverPage`    | Yes           | Find and join new rooms       |
| `/rooms`         | —                 | Yes           | Redirects to `/memberships`   |
| `/rooms/:roomId` | `RoomView`        | Yes           | In-room chat + member sidebar |
