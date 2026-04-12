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

| Column       | Type          | Notes                                     |
| ------------ | ------------- | ----------------------------------------- |
| `id`         | `serial`      | PK                                        |
| `room_id`    | `integer`     | FK → `rooms.id`, cascade delete, not null |
| `user_id`    | `integer`     | FK → `users.id`, cascade delete, not null |
| `section`    | `varchar(20)` | `'players'` or `'spectators'`, not null   |
| `position`   | `integer`     | Order within section, 0-indexed, not null |
| `created_at` | `timestamptz` | Not null, default `now()`                 |

Constraints: `UNIQUE(room_id, user_id)`, index on `room_id`

### Columns added to `rooms` table

| Column           | Type      | Notes                                |
| ---------------- | --------- | ------------------------------------ |
| `member_limit`   | `integer` | Nullable. Null or 0 means unlimited. |
| `rotate_players` | `boolean` | Not null, default `false`            |

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

New members always join as the last spectator. The room owner can drag members between sections and reorder within sections.

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
- **Rotate Players toggle** for automatic seat rotation after games

## Roster Reordering

The owner can drag members within and between the Players and Spectators lists using Angular CDK drag-drop. On drop, the frontend sends the full new ordering to the backend via `PUT /api/rooms/:id/roster` (REST) or `roster:update` (WS).

Validation rules:

- Only the room owner can reorder
- The new roster must contain exactly the same set of user IDs (no additions or removals)
- Reordering is blocked while a game session is active (409 Conflict)

After a successful reorder, the server broadcasts `ROSTER_UPDATED` to all connected room members.

## Seat Rotation

When the "Rotate Players" toggle is enabled and a game ends:

```text
Before (rotate ON, spectators non-empty):
  Players:    [A, B, C]
  Spectators: [D, E]

After game-over:
  Players:    [B, C, D]     ← D promoted from spectators
  Spectators: [E, A]        ← A demoted from players
```

When the toggle is off (or spectators list is empty), the first player cycles to the bottom of the players list:

```text
Before (rotate OFF):
  Players:    [A, B, C]

After game-over:
  Players:    [B, C, A]
```

The rotation logic is implemented as a pure function in `libs/engine/src/lib/roster-logic.ts` and called by `RoomService.rotateSeat()` after game-over.

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

## Membership Limit

Rooms can have an optional member limit set at creation time. This caps the total number of roster members (players + spectators). The limit is immutable after creation.

- Displayed in the room list as `rosterCount / memberLimit` (e.g., "5 / 8")
- Rooms without a limit show just the count (e.g., "5")
- The Join button is grayed out and shows "Full" when the room is at capacity and the user is not already on the roster
- Existing roster members can always rejoin regardless of capacity

## Real-Time Synchronization

All roster mutations broadcast the full `RosterState` to every connected room member via the `roster:updated` WS event. The frontend replaces its local state on each broadcast, avoiding diff/patch complexity.

Events that trigger a roster broadcast:

- New member joins (added to roster)
- Member leaves (removed from roster)
- Member kicked or banned (removed from roster)
- Owner reorders the roster
- Owner toggles the rotate setting
- Seat rotation after game-over

## REST API

| Method  | Path                           | Auth       | Description                        |
| ------- | ------------------------------ | ---------- | ---------------------------------- |
| `GET`   | `/api/rooms/:id/roster`        | Any member | Returns the current `RosterState`  |
| `PUT`   | `/api/rooms/:id/roster`        | Owner only | Reorders the roster                |
| `PATCH` | `/api/rooms/:id/roster/rotate` | Owner only | Toggles the rotate-players setting |
| `POST`  | `/api/rooms/:id/kick`          | Owner only | Kicks a member from the roster     |

## WebSocket Events

### Client → Server

| Event                  | Payload                               | Description                              |
| ---------------------- | ------------------------------------- | ---------------------------------------- |
| `room:join`            | `{ roomId }`                          | Join room (adds to roster if new)        |
| `room:leave`           | `{ roomId }`                          | Disconnect from WS only (stay on roster) |
| `room:leave-roster`    | `{ roomId }`                          | Leave the roster and disconnect          |
| `roster:update`        | `{ roomId, players[], spectators[] }` | Owner reorders roster                    |
| `roster:toggle-rotate` | `{ roomId, enabled }`                 | Owner toggles rotation                   |

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

The Memberships page displays rooms the user belongs to in a table. The Discover page displays rooms the user can join. Both use the shared `RoomTableComponent`. The Members column shows `rosterCount / memberLimit` for capped rooms. The Join button is disabled with "Full" text when the room is at capacity and the current user is not on the roster.

### RoomMembersTab

The main roster UI inside the room view. Sections from top to bottom:

1. Roster count display
2. Rotate Players toggle (owner only)
3. Players list (drag-drop enabled for owner, disabled during games)
4. Spectators list (drag-drop, connected to players list for cross-list drops)
5. Invited list (invite-only rooms, non-roster invitees)
6. Invite search (owner of invite-only rooms)
7. Banned list (owner only)

Each roster member row shows a status dot (green = connected, gray = disconnected) with a tooltip ("In room" / "Not in room") and an overflow menu for owner actions.

### RosterService

Singleton Angular service managing roster state via signals. Listens for `ROSTER_UPDATED` and `ROOM_JOINED` WS events to keep `players`, `spectators`, and `rotatePlayers` signals in sync. Provides HTTP methods for reorder, kick, and toggle operations.

Exports three pure helper functions for testability:

- `computeStatus(userId, onlineUserIds)` — returns `'online'` or `'offline'`
- `computeInvitedList(invites, roster)` — filters invitees who are not on the roster
- `formatRosterCount(count, limit)` — formats as `"N / M"` or `"N"`

### OverflowMenuComponent

A small standalone component rendering a "..." trigger button with an accessible dropdown menu. Used for Kick/Ban actions on roster members and Revoke on invitees.

## Pure Roster Logic

Core roster manipulation functions live in `libs/engine/src/lib/roster-logic.ts` as pure functions (no side effects, no DB access). The backend services call these and handle persistence separately.

| Function                                         | Description                                                  |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `addMember(roster, member, limit?)`              | Adds to bottom of spectators. Returns `null` if at capacity. |
| `removeMember(roster, userId)`                   | Removes from either list, reindexes positions.               |
| `reorderRoster(roster, players[], spectators[])` | Validates same member set, rebuilds with new order.          |
| `rotateSeat(roster)`                             | Applies seat rotation logic based on `rotatePlayers` flag.   |
| `handleDisconnect(roster, userId)`               | Identity function (disconnect does not modify roster).       |
