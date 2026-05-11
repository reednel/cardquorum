export interface ReplayEventDto {
  eventType: string;
  userId: number | null;
  payload: unknown;
  message: string | null;
  seq: number;
  createdAt: string; // ISO 8601
}

export interface ReplayParticipantDto {
  userId: number;
  seatIndex: number;
  displayName: string;
  username: string;
}

export interface ReplayDataResponse {
  sessionId: number;
  gameType: string;
  config: unknown;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  colorMap: Record<number, number>; // userId → hue (extracted from game_started event payload)
  participants: ReplayParticipantDto[];
  events: ReplayEventDto[];
}

export interface ReplaySessionSummary {
  sessionId: number;
  gameType: string;
  status: string;
  roomName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ReplaySessionListResponse {
  sessions: ReplaySessionSummary[];
  nextCursor: string | null;
}
