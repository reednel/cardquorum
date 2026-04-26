# Room Membership

This document describes the room membership system: how users join rooms, how the persistent roster works, how the room owner manages members, and how the roster integrates with the game engine.

## Concepts

There are two distinct layers of "being in a room":

1. **WebSocket presence** (ephemeral) — tracked by `RoomManager` in memory. Represents who has an active WebSocket connection to the room right now. Lost on disconnect, restored on reconnect.

2. **Roster membership** (persistent) — stored in the `room_rosters` database table. Represents who is a member of the room, in what role (player or spectator), and in what order. Survives page refreshes, disconnects, and server restarts.

A user can be on the roster but not connected (gray status dot), or connected but not yet on the roster (briefly, during the join flow). The Members tab in the UI shows roster membership with online/offline indicators derived from WS presence.

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                       Frontend                          │
│                                                         │
│  MembershipsPage / DiscoverPage                        │
│       │                                                 │
│       └──► RoomView ──┬── RoomMembersTab                │
│                          │     ├── RosterService        │
│                          │     ├── ChatService          │
│                          │     ├── OverflowMenu         │
│                          │     └── CDK Drag-Drop        │
│                          ├── RoomChatTab                │
│                          └── RoomGameTab                │
│                                                         │
│  HTTP (/api/rooms/*)          WS (/ws)                  │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
┌──────────▼──────────────────────▼───────────────────────┐
│                       Backend                           │
│                                                         │
│  RoomController              RoomGateway                │
│  (REST endpoints)            (WS handlers)              │
│         │                        │                      │
│         └────────┬───────────────┘                      │
│                  ▼                                      │
│             RoomService                                 │
│          ┌───────┴────────┐                             │
│          ▼                ▼                             │
│   RoomManager      RoomRosterRepository                 │
│   (in-memory WS)   (persistent DB)                      │
│                          │                              │
│                    ┌─────▼───────┐                      │
│                    │ PostgreSQL  │                      │
│                    │ room_rosters│                      │
│                    │ rooms       │                      │
│                    └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### `room_rosters` table

| Column            | Type          | Notes                                     |
| ----------------- | ------------- | ----------------------------------------- |
| `id`              | `serial`      | PK                                        |
| `room_id`         | `integer`     | FK → `rooms.id`, cascade delete, not null |
| `user_id`         | `integer`     | FK → `users.id`, cascade delete, not null |
| `section`         | `varchar(20)` | `'players'` or `'spectators'`, not null   |
| `position`        | `integer`     | Order within section, 0-indexed, not null |
| `ready_to_play`   | `boolean`     | Not null, default `false`                 |
| `assigned_hue`    | `smallint`    | Nullable, palette hue for player color    |
| `created_at`      | `timestamptz` | Not null, default `now()`                 |
| `last_visited_at` | `timestamptz` | Not null, default `now()`                 |

Constraints: `UNIQUE(room_id, user_id)`, index on `room_id`

### Columns on `rooms` table (roster-related)

| Column          | Type          | Notes                                                                                             |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `member_limit`  | `integer`     | Nullable. When set, must be 1–128. Null means no displayed limit (128 enforced server-side).      |
| `rotation_mode` | `varchar(20)` | Not null, default `'rotate-players'`. One of `'none'`, `'rotate-players'`, `'rotate-spectators'`. |

## Room Visibility and Access Control

Rooms have three visibility modes that control who can see and join them:

- **public** — visible and joinable by anyone
- **friends-only** — visible and joinable only by friends of the room owner
- **invite-only** — visible and joinable only by users with a pending invite

Access checks also enforce bans (banned users cannot see or join) and blocks (if the owner blocked a user, that user cannot see or join).

## Join Flow

```text
User navigates to /rooms/:id
         │
         ▼
   HTTP GET /api/rooms/:id
   (checks canAccessRoom)
         │
    ┌────┴───┐
    │ Denied │──► redirect to /rooms
    └────┬───┘
         │ OK
         ▼
   WS room:join { roomId }
         │
         ▼
   Gateway checks:
   1. Room exists?
   2. canAccessRoom?
   3. Already on roster?
         │
    ┌────┴──────────────┐
    │ Already on roster │──► getRoster(), skip capacity check
    └────┬──────────────┘
         │ Not on roster
         ▼
   Check memberLimit:
   rosterCount < memberLimit?
         │
    ┌────┴────┐
    │  Full   │──► WS error "Room is full"
    │         │    undo WS join
    │         │    frontend redirects to /rooms
    └────┬────┘
         │ OK
         ▼
   addToRoster (as last spectator)
   broadcast ROSTER_UPDATED
         │
         ▼
   Send ROOM_JOINED { members, roster }
   Send MESSAGE_HISTORY
   Broadcast MEMBER_JOINED to others
```

Users already on the roster always bypass the capacity check, so they can reconnect to a full room.

## Disconnect vs Leave

These are two different operations:

**Disconnect** (browser close, network drop, navigation away):

- Removes the user from `RoomManager` (WS presence)
- Does NOT remove from roster
- User appears with a gray status dot
- Broadcasts `MEMBER_LEFT` to other connected members

**Leave** (clicking the Leave button):

- Sends `room:leave-roster` WS event
- Removes from the persistent roster
- Removes from `RoomManager`
- Broadcasts `ROSTER_UPDATED` and `MEMBER_LEFT`
- Frees up a roster slot (relevant for rooms with a member limit)
- The room owner cannot leave their own room

## Roster Sections

Every roster member belongs to one of two sections:

- **Players** — participate in game sessions
- **Spectators** — observe but do not play

New members always join as the last spectator with `readyToPlay` set to `false`.

### Ready to Play

Each roster member has a `readyToPlay` boolean flag that controls game eligibility:

- **Spectators**: only ready spectators can be moved into the players section (by the owner via drag-drop or by automatic rotation). Non-ready spectators have drag disabled.
- **Players (no active game)**: toggling to not-ready immediately demotes the player to the bottom of spectators.
- **Players (active game)**: toggling to not-ready defers demotion until the game ends. Toggling back to ready before game end cancels the pending demotion.

The room owner can drag members between sections and reorder within sections, but cannot move a non-ready spectator into the players section.

## Owner Actions

The room owner has exclusive access to these actions, all behind a "..." overflow menu on each member row:

| Action               | Effect                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Kick                 | Removes from roster, disconnects WS, sends `MEMBER_KICKED`. User can rejoin. Invites are preserved.           |
| Ban                  | Removes from roster, disconnects WS, revokes invite, creates a ban record. User cannot rejoin until unbanned. |
| Unban                | Removes the ban record. User can rejoin.                                                                      |
| Revoke (invite-only) | Removes a pending invite from the Invited list.                                                               |

The owner also controls:

- **Drag-and-drop reordering** of the Players and Spectators lists (disabled during active games)
- **Rotation mode** — a three-option segmented control for `None`, `Rotate Players`, or `Rotate Spectators`

### Active Game Restrictions

During an active game, the following restrictions apply:

- Players cannot leave the room or be kicked/banned (backend rejects with 409 Conflict)
- Spectators can still leave/be kicked/banned normally
- Kick/ban overflow menu options are hidden for players during active games
- Roster reordering is disabled

## Roster Reordering

The owner can drag members within and between the Players and Spectators lists using Angular CDK drag-drop. On drop, the frontend sends the full new ordering to the backend via `PUT /api/rooms/:id/roster` (REST) or `roster:update` (WS).

Validation rules:

- Only the room owner can reorder
- The new roster must contain exactly the same set of user IDs (no additions or removals)
- Non-ready spectators cannot be moved into the players section (rejected with 409 Conflict)
- Reordering is blocked while a game session is active (409 Conflict)

After a successful reorder, the server broadcasts `ROSTER_UPDATED` to all connected room members.

## Seat Rotation

Rooms have three rotation modes, controlled by the `rotation_mode` column:

### Post-Game Pipeline

When a game ends, `RoomService.handlePostGame()` executes this sequence:

1. **Demote not-ready players** — all players with `readyToPlay === false` are moved to spectators
2. **Apply rotation** — based on the room's rotation mode
3. **Broadcast** — a single `ROSTER_UPDATED` event reflecting both demotions and rotation

### Rotation Modes

**None** — no changes to player order after game end.

**Rotate Players** (default) — the first player cycles to the bottom of the players list:

```text
Before:
  Players:    [A, B, C]
  Spectators: [D, E]

After game-over:
  Players:    [B, C, A]
  Spectators: [D, E]
```

**Rotate Spectators** — swaps the first player with the first ready spectator. If player slots are available (below the game's required count), fills them from ready spectators without removing existing players. Falls back to rotate-players behavior when no ready spectators exist:

```text
Before (player count = required, ready spectator exists):
  Players:    [A, B, C]
  Spectators: [D(ready), E(not ready)]

After game-over:
  Players:    [B, C, D]     ← D promoted from spectators
  Spectators: [E, A]        ← A demoted from players
```

The rotation logic is implemented as pure functions in `libs/engine/src/lib/roster-logic.ts` (`rotateSeatV2`, `demoteNotReadyPlayers`) and orchestrated by `RoomService.handlePostGame()`.

## Game Integration

When a game session starts, `GameService.startSession` reads the Players list from the roster (not the WS presence list). Only users in the Players section participate. The player count must exactly match the game configuration's required player count.

```text
GameService.startSession(sessionId, requestedBy)
  │
  ▼
roomService.getRoster(roomId)
  │
  ▼
playerIDs = roster.players.map(p => p.userId)
  │
  ▼
Validate: playerIDs.length === config.playerCount
  │
  ▼
Initialize game state with playerIDs
```

### Game Abandonment

Players can abandon an active game via the `game:abandon` WS event. This triggers the plugin's `onPlayerAbandon` method (if implemented) to transition the game to a terminal state, or falls back to cancelling with status `abandoned`.

After abandonment:

- Game-over is broadcast to all players
- The post-game pipeline runs (demote not-ready + rotate)
- The abandoning player is demoted to spectator with `readyToPlay` set to `false`

### Reconnection During Active Game

When a player disconnects during an active game:

- Their roster section is preserved as `players` (disconnect does not trigger abandonment)
- On reconnect, they are restored to their original roster section
- The game rejoin flow restores their player view and valid actions

## Membership Limit

Rooms have an optional member limit (1–128) that caps the total number of roster members (players + spectators). When no limit is set (`null`), the backend enforces a hard cap of 128.

- `null` or `0` stored values are treated as 128 for capacity enforcement, but are not displayed as a limit in the UI
- Backend rejects `memberLimit` values outside 1–128 on create/update
- Room listings display `rosterCount / memberLimit` when a limit is set, or just `rosterCount` when null
- The Join button is grayed out and shows "Full" when the room is at capacity and the user is not already on the roster
- Existing roster members can always rejoin regardless of capacity
- The room creation form accepts an optional limit (1–128), with placeholder text "1 - 128"; when left empty, no limit is sent

## Real-Time Synchronization

All roster mutations broadcast the full `RosterState` to every connected room member via the `roster:updated` WS event. The frontend replaces its local state on each broadcast, avoiding diff/patch complexity.

Events that trigger a roster broadcast:

- New member joins (added to roster)
- Member leaves (removed from roster)
- Member kicked or banned (removed from roster)
- Owner reorders the roster
- Owner changes the rotation mode
- Member toggles ready-to-play (with possible immediate demotion)
- Post-game pipeline (demotions + rotation)
- Game abandonment (demotes abandoning player)

## REST API

| Method  | Path                           | Auth       | Description                        |
| ------- | ------------------------------ | ---------- | ---------------------------------- |
| `GET`   | `/api/rooms/:id/roster`        | Any member | Returns the current `RosterState`  |
| `PUT`   | `/api/rooms/:id/roster`        | Owner only | Reorders the roster                |
| `PATCH` | `/api/rooms/:id/roster/rotate` | Owner only | Toggles the rotate-players setting |
| `POST`  | `/api/rooms/:id/kick`          | Owner only | Kicks a member from the roster     |

## WebSocket Events

### Client → Server

| Event                      | Payload                               | Description                              |
| -------------------------- | ------------------------------------- | ---------------------------------------- |
| `room:join`                | `{ roomId }`                          | Join room (adds to roster if new)        |
| `room:leave`               | `{ roomId }`                          | Disconnect from WS only (stay on roster) |
| `room:leave-roster`        | `{ roomId }`                          | Leave the roster and disconnect          |
| `roster:update`            | `{ roomId, players[], spectators[] }` | Owner reorders roster                    |
| `roster:toggle-rotate`     | `{ roomId, enabled }`                 | Owner toggles rotation (legacy)          |
| `roster:toggle-ready`      | `{ roomId }`                          | Toggle own ready-to-play status          |
| `roster:set-rotation-mode` | `{ roomId, mode }`                    | Owner sets rotation mode                 |
| `game:abandon`             | `{ sessionId }`                       | Player abandons active game              |

### Server → Client

| Event            | Payload                       | Description                                 |
| ---------------- | ----------------------------- | ------------------------------------------- |
| `room:joined`    | `{ roomId, members, roster }` | Sent to the joining client                  |
| `roster:updated` | `{ roomId, roster }`          | Broadcast on any roster change              |
| `member:joined`  | `{ roomId, member }`          | Broadcast when a user connects              |
| `member:left`    | `{ roomId, member }`          | Broadcast when a user disconnects or leaves |
| `member:kicked`  | `{ roomId, userId }`          | Sent to the kicked/banned user              |

## Frontend Components

### MembershipsPage / DiscoverPage

The Memberships page displays rooms the user belongs to in a table. The Discover page displays rooms the user can join. Both use the shared `RoomTableComponent`. The Members column shows `rosterCount / memberLimit` when a limit is set, or just `rosterCount` when null. The Join button is disabled with "Full" text when the room is at capacity and the current user is not on the roster.

### RoomMembersTab

The main roster UI inside the room view. Sections from top to bottom:

1. Roster count display
2. Rotation mode segmented control — None / Players / Spectators (owner only)
3. Players list (drag-drop enabled for owner, disabled during games)
4. Spectators list (drag-drop, connected to players list for cross-list drops; non-ready spectators have drag disabled)
5. Abandon Game button (visible to players during active games)
6. Invited list (invite-only rooms, non-roster invitees)
7. Invite search (owner of invite-only rooms)
8. Banned list (owner only)

Each roster member row shows:

- A ready-to-play icon (`user-check` or `user-x`) on the left — interactive button for the current user, static for others
- A status dot (green = connected, gray = disconnected) with tooltip
- The member's display name
- A crown icon to the right of the name for the room owner
- An overflow menu for owner actions (hidden for players during active games)

A dismissible tooltip appears near the user's own spectator entry when they join as not-ready, prompting them to toggle ready.

### RosterService

Singleton Angular service managing roster state via signals. Listens for `ROSTER_UPDATED` and `ROOM_JOINED` WS events to keep `players`, `spectators`, and `rotationMode` signals in sync. Provides HTTP methods for reorder, kick, and toggle operations, plus WS methods for `toggleReady` and `setRotationMode`.

Exports three pure helper functions for testability:

- `computeStatus(userId, onlineUserIds)` — returns `'online'` or `'offline'`
- `computeInvitedList(invites, roster)` — filters invitees who are not on the roster
- `formatRosterCount(count, limit)` — formats as `"N / M"` when limit is set, or just `"N"` when null

### OverflowMenuComponent

A small standalone component rendering a "..." trigger button with an accessible dropdown menu. Used for Kick/Ban actions on roster members and Revoke on invitees.

## Pure Roster Logic

Core roster manipulation functions live in `libs/engine/src/lib/roster-logic.ts` as pure functions (no side effects, no DB access). The backend services call these and handle persistence separately.

| Function                                             | Description                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `addMember(roster, member, limit?)`                  | Adds to bottom of spectators with `readyToPlay: false`. Returns `null` if at capacity. |
| `removeMember(roster, userId)`                       | Removes from either list, reindexes positions.                                         |
| `reorderRoster(roster, players[], spectators[])`     | Validates same member set, rebuilds with new order.                                    |
| `rotateSeat(roster)`                                 | Legacy rotation — cycles first player to bottom of players.                            |
| `rotateSeatV2(roster, mode, requiredPlayerCount)`    | Three-mode rotation: none, rotate-players, rotate-spectators.                          |
| `toggleReady(roster, userId)`                        | Flips only the target member's `readyToPlay`.                                          |
| `demotePlayer(roster, userId)`                       | Moves a player to bottom of spectators, sets `readyToPlay` to `false`.                 |
| `demoteNotReadyPlayers(roster)`                      | Moves all players with `readyToPlay === false` to spectators.                          |
| `validateReorder(roster, newPlayers, newSpectators)` | Rejects reorders that move non-ready spectators into players.                          |
| `handleDisconnect(roster, userId)`                   | Identity function (disconnect does not modify roster).                                 |
