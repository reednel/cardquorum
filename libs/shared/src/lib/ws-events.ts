/**
 * Client → Server event names.
 * These are the message types a client sends to the gateway.
 */
export const WS_EVENT = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  CHAT_SEND: 'chat:send',
} as const;

/**
 * Server → Client event names.
 * These are the message types the gateway pushes to clients.
 */
export const WS_EMIT = {
  ROOM_JOINED: 'room:joined',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  CHAT_MESSAGE: 'chat:message',
  MESSAGE_HISTORY: 'message:history',
  ERROR: 'error',
} as const;
