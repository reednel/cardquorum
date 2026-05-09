import { and, asc, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { GameEvent, gameEvents, NewGameEvent } from '../schema';
import { DbInstance } from '../types';

const DEFAULT_PAGE_SIZE = 50;

export class GameEventRepository {
  constructor(private readonly db: DbInstance) {}

  async batchInsert(events: NewGameEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.db.insert(gameEvents).values(events);
  }

  async findByRoomId(roomId: number, cursor?: number, pageSize?: number): Promise<GameEvent[]> {
    const limit = pageSize ?? DEFAULT_PAGE_SIZE;

    const conditions = [eq(gameEvents.roomId, roomId), isNotNull(gameEvents.message)];

    if (cursor != null) {
      conditions.push(lt(gameEvents.id, cursor));
    }

    return this.db
      .select()
      .from(gameEvents)
      .where(and(...conditions))
      .orderBy(desc(gameEvents.createdAt))
      .limit(limit);
  }

  async findBySessionId(sessionId: number): Promise<GameEvent[]> {
    return this.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.sessionId, sessionId))
      .orderBy(asc(gameEvents.seq));
  }
}
