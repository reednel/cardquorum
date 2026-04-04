/**
 * Client → Server event names.
 * These are the message types a client sends to the gateway.
 */
export const WS_EVENT = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  CHAT_SEND: 'chat:send',
  GAME_CREATE: 'game:create',
  GAME_START: 'game:start',
  GAME_ACTION: 'game:action',
  GAME_REJOIN: 'game:rejoin',
  GAME_CANCEL: 'game:cancel',
  ROOM_LEAVE_ROSTER: 'room:leave-roster',
  ROSTER_UPDATE: 'roster:update',
  ROSTER_TOGGLE_ROTATE: 'roster:toggle-rotate',
} as const;

/**
 * Server → Client event names.
 * These are the message types the gateway pushes to clients.
 */
export const WS_EMIT = {
  CONNECTED: 'ws:connected',
  ROOM_JOINED: 'room:joined',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  ROOM_DELETED: 'room:deleted',
  CHAT_MESSAGE: 'chat:message',
  MESSAGE_HISTORY: 'message:history',
  MEMBER_KICKED: 'member:kicked',
  ERROR: 'error',
  GAME_CREATED: 'game:created',
  GAME_STARTED: 'game:started',
  GAME_STATE_UPDATE: 'game:state-update',
  GAME_OVER: 'game:over',
  GAME_ERROR: 'game:error',
  GAME_CANCELLED: 'game:cancelled',
  ROSTER_UPDATED: 'roster:updated',
} as const;
