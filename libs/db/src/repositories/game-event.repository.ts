import { eq } from 'drizzle-orm';
import { gameEvents } from '../schema';
import { DbInstance } from '../types';

export class GameEventRepository {
  constructor(private readonly db: DbInstance) {}

  async findBySessionId(sessionId: number) {
    return this.db.select().from(gameEvents).where(eq(gameEvents.sessionId, sessionId));
  }

  async create(data: {
    sessionId: number;
    userId?: number;
    seq: number;
    eventType: string;
    payload?: unknown;
  }) {
    const [row] = await this.db.insert(gameEvents).values(data).returning();
    return row;
  }
}
