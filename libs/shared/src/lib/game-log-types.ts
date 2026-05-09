/**
 * Payload broadcast to room members when a game event with a visible message occurs.
 */
export interface GameLogBroadcast {
  /** Database row ID. Present on history entries, absent on real-time/catchup entries. */
  id?: number;
  sessionId: number;
  userId: number | null;
  eventType: string;
  message: string;
  timestamp: string; // ISO 8601
}

/**
 * In-memory buffer entry representing a single game event before persistence.
 */
export interface EventBufferEntry {
  roomId: number;
  sessionId: number;
  userId: number | null;
  eventType: string;
  payload: unknown;
  message: string | null;
  seq: number;
  createdAt: Date;
}

/**
 * Payload sent from client to request game log history.
 */
export interface GameLogHistoryPayload {
  roomId: number;
  cursor?: number;
  pageSize?: number;
}
