export interface UserIdentity {
  userId: number;
  displayName: string;
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

export interface WsErrorPayload {
  message: string;
}
