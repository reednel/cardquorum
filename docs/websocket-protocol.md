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
  ├─ room:join ───────────────────►│  (ensures room in DB, joins RoomManager)
  │                                │
  │◄──────────────── room:joined ──┤  (member list)
  │◄──────────── message:history ──┤  (last 50 messages)
  │                                │
  │          (other clients get)   │
  │       ◄── member:joined ───────┤
  │                                │
  ├─ chat:send ───────────────────►│  (persists to DB, publishes to Redis)
  │                                │
  │◄──────────── chat:message ─────┤  (broadcast via Redis pub/sub)
  │                                │
  ├─ room:leave ──────────────────►│
  │          (other clients get)   │
  │        ◄── member:left ────────┤
  │                                │
  │  (on disconnect, server auto-  │
  │   leaves all rooms and         │
  │   broadcasts departures)       │
```

## Testing with wscat

```sh
# Install wscat if you don't have it
npx wscat -c ws://localhost:3000/ws

# Join a room (paste this as one line)
{"event":"room:join","data":{"roomId":"00000000-0000-0000-0000-000000000001","nickname":"Alice"}}

# Send a message
{"event":"chat:send","data":{"roomId":"00000000-0000-0000-0000-000000000001","content":"Hello!"}}
```

## Adding New Events

1. Add the event name to `WS_EVENT` or `WS_EMIT` in `libs/shared/src/lib/ws-events.ts`.
2. Add the payload interface to `libs/shared/src/lib/ws-types.ts`.
3. Export from `libs/shared/src/index.ts`.
4. Implement the `@SubscribeMessage` handler in the appropriate gateway.
5. Update the stability tests in `libs/shared/src/lib/ws-events.spec.ts`.

## Redis Pub/Sub

Chat messages are published to the `chat:messages` Redis channel after being persisted. The gateway subscribes to this channel on init and broadcasts incoming messages to local WebSocket clients in the relevant room.

This means if you scale to multiple backend instances, messages sent via one instance are received by clients connected to any instance.
