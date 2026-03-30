export interface UserIdentity {
  userId: number;
  username: string;
  displayName: string | null;
}

// --- Client → Server payloads ---

export interface JoinRoomPayload {
  roomId: number;
}

export interface LeaveRoomPayload {
  roomId: number;
}

export interface SendMessagePayload {
  roomId: number;
  content: string;
}

// --- Server → Client payloads ---

export interface RoomJoinedPayload {
  roomId: number;
  members: UserIdentity[];
}

export interface MemberChangePayload {
  roomId: number;
  member: UserIdentity;
}

export interface ChatMessagePayload {
  id: number;
  roomId: number;
  senderUserId: number;
  senderDisplayName: string;
  content: string;
  sentAt: string;
}

export interface MessageHistoryPayload {
  roomId: number;
  messages: ChatMessagePayload[];
}

export interface RoomDeletedPayload {
  roomId: number;
}

export interface MemberKickedPayload {
  roomId: number;
  userId: number;
}

export interface WsErrorPayload {
  message: string;
}

// --- Game: Client → Server payloads ---

export interface GameCreatePayload {
  roomId: number;
  gameType: string;
  config: unknown;
}

export interface GameStartPayload {
  sessionId: number;
}

export interface GameActionPayload {
  sessionId: number;
  action: {
    type: string;
    payload?: unknown;
  };
}

export interface GameRejoinPayload {
  roomId: number;
}

export interface GameCancelPayload {
  sessionId: number;
}

// --- Game: Server → Client payloads ---

export interface GameCreatedPayload {
  sessionId: number;
  gameType: string;
  config: unknown;
}

export interface GameStartedPayload {
  sessionId: number;
  state: unknown;
}

export interface GameStateUpdatePayload {
  sessionId: number;
  state: unknown;
}

export interface GameOverPayload {
  sessionId: number;
  store: unknown;
}

export interface GameErrorPayload {
  sessionId?: number;
  message: string;
}

export interface GameCancelledPayload {
  sessionId: number;
}
