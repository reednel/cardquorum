/** Stub identity until OIDC auth is wired up. */
export interface UserIdentity {
  userId: string;
  nickname: string;
}

// --- Client → Server payloads ---

export interface JoinRoomPayload {
  roomId: string;
  nickname: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface SendMessagePayload {
  roomId: string;
  content: string;
}

// --- Server → Client payloads ---

export interface RoomJoinedPayload {
  roomId: string;
  members: UserIdentity[];
}

export interface MemberChangePayload {
  roomId: string;
  member: UserIdentity;
}

export interface ChatMessagePayload {
  id: string;
  roomId: string;
  senderUserId: string;
  senderNickname: string;
  content: string;
  sentAt: string;
}

export interface MessageHistoryPayload {
  roomId: string;
  messages: ChatMessagePayload[];
}

export interface WsErrorPayload {
  message: string;
}
