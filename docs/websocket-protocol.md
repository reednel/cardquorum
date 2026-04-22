# WebSocket Protocol

## Connection

The WebSocket server listens at `/ws`. In development, the Angular dev server proxies this automatically (see `apps/frontend/proxy.conf.json`).

```sh
ws://localhost:4200/ws   # via Angular proxy (dev)
ws://localhost:3000/ws   # direct to backend
```

## Wire Format

All messages are JSON with this shape:

```json
{ "event": "<event-name>", "data": { ... } }
```

## Events

Event name constants are defined in `@cardquorum/shared` (`WS_EVENT` for client→server, `WS_EMIT` for server→client). Payload types are in the same package.

## Typical Flow

```txt
Client                          Server
  │                                │
  ├─ room:join ───────────────────►│  (checks room exists in DB, joins RoomManager)
  │                                │
  │◄──────────────── room:joined ──┤  (member list)
  │◄──────────── message:history ──┤  (last 50 messages)
  │                                │
  │          (other clients get)   │
  │       ◄── member:joined ───────┤
  │                                │
  ├─ chat:send ───────────────────►│  (persists to DB)
  │                                │
  │◄──────────── chat:message ─────┤  (broadcast to room members)
  │                                │
  ├─ room:leave ──────────────────►│
  │          (other clients get)   │
  │        ◄── member:left ────────┤
  │                                │
  │  (on disconnect, server auto-  │
  │   leaves all rooms and         │
  │   broadcasts departures)       │
  │                                │
  │  (if room owner deletes room   │
  │   via REST API, all members    │
  │   receive room:deleted)        │
  │       ◄── room:deleted ────────┤
  │                                │
  │  (if room owner bans a member  │
  │   via REST API, that member    │
  │   receives member:kicked and   │
  │   is removed from the room)    │
  │       ◄── member:kicked ───────┤
```

### Game Target Query

```txt
Client                          Server
  │                                │
  ├─ game:query-targets ─────────►│  (read-only: calls plugin.getValidTargets)
  │                                │
  │◄────── game:valid-targets ─────┤  ({ generation, targets: string[] })
```

The target query is a read-only round-trip used by the `InteractionController` to determine valid drop targets for a card selection. The `generation` counter prevents stale responses from overwriting newer queries. See [game-table-ui.md](game-table-ui.md) for the full flow.

**Note:** Rooms must be created via `POST /api/rooms` before joining. Attempting to join a non-existent room returns a WS error.

## Testing with wscat

```sh
# Install wscat if you don't have it
npx wscat -c ws://localhost:3000/ws

# Join a room (room must exist — use integer ID)
{"event":"room:join","data":{"roomId":1}}

# Send a message
{"event":"chat:send","data":{"roomId":1,"content":"Hello!"}}
```

## Adding New Events

1. Add the event name to `WS_EVENT` or `WS_EMIT` in `libs/shared/src/lib/ws-events.ts`.
2. Add the payload interface to `libs/shared/src/lib/ws-types.ts`.
3. Export from `libs/shared/src/index.ts`.
4. Implement the `@SubscribeMessage` handler in the appropriate gateway.
5. Update the stability tests in `libs/shared/src/lib/ws-events.spec.ts`.
