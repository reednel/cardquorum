import { eq } from 'drizzle-orm';
import { gamePlayers } from '../schema';
import { DbInstance } from '../types';

export class GamePlayerRepository {
  constructor(private readonly db: DbInstance) {}

  async findBySessionId(sessionId: number) {
    return this.db.select().from(gamePlayers).where(eq(gamePlayers.sessionId, sessionId));
  }

  async create(data: { sessionId: number; userId: number; seatIndex: number }) {
    const [row] = await this.db.insert(gamePlayers).values(data).returning();
    return row;
  }

  async updateScore(id: number, score: number, won: number) {
    const [row] = await this.db
      .update(gamePlayers)
      .set({ score, won })
      .where(eq(gamePlayers.id, id))
      .returning();
    return row;
  }
}
