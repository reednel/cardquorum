import { Injectable } from '@nestjs/common';
import {
  GameEvent,
  GameEventRepository,
  GameParticipantRepository,
  NewGameEvent,
} from '@cardquorum/db';
import { GameEventBase } from '@cardquorum/engine';

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

export interface GameLogBroadcast {
  sessionId: number;
  userId: number | null;
  eventType: string;
  message: string;
  timestamp: string; // ISO 8601
}

@Injectable()
export class EventLogService {
  constructor(
    private readonly gameEventRepo: GameEventRepository,
    private readonly gameParticipantRepo: GameParticipantRepository,
  ) {}

  /** Append an event to the in-memory buffer with auto-incrementing seq. */
  bufferEvent(
    buffer: EventBufferEntry[],
    event: GameEventBase,
    message: string | null,
    roomId: number,
    sessionId: number,
  ): void {
    const seq = buffer.length + 1;
    buffer.push({
      roomId,
      sessionId,
      userId: event.userID ?? null,
      eventType: event.type,
      payload: event.payload ?? {},
      message,
      seq,
      createdAt: new Date(),
    });
  }

  /** Flush all buffered events to the database in a single batch insert. */
  async flushBuffer(buffer: EventBufferEntry[]): Promise<void> {
    const events: NewGameEvent[] = buffer.map((entry) => ({
      roomId: entry.roomId,
      sessionId: entry.sessionId,
      userId: entry.userId,
      eventType: entry.eventType,
      payload: entry.payload,
      message: entry.message,
      seq: entry.seq,
      createdAt: entry.createdAt,
    }));
    await this.gameEventRepo.batchInsert(events);
  }

  /** Insert participant rows for a started session. */
  async recordParticipants(sessionId: number, playerIDs: number[]): Promise<void> {
    const participants = playerIDs.map((userId, index) => ({
      sessionId,
      userId,
      seatIndex: index,
    }));
    await this.gameParticipantRepo.batchInsert(participants);
  }

  /** Get paginated room log (non-null messages only). */
  async getRoomLog(roomId: number, cursor?: number, pageSize?: number): Promise<GameEvent[]> {
    return this.gameEventRepo.findByRoomId(roomId, cursor, pageSize);
  }

  /** Get in-memory catch-up entries (non-null messages only, ordered by seq). */
  getCatchUpEntries(buffer: EventBufferEntry[]): GameLogBroadcast[] {
    return buffer
      .filter((entry): entry is EventBufferEntry & { message: string } => entry.message !== null)
      .sort((a, b) => a.seq - b.seq)
      .map((entry) => ({
        sessionId: entry.sessionId,
        userId: entry.userId,
        eventType: entry.eventType,
        message: entry.message,
        timestamp: entry.createdAt.toISOString(),
      }));
  }
}
