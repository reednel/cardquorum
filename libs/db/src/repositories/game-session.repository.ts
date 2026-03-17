import { eq } from 'drizzle-orm';
import { gameSessions } from '../schema';
import { DbInstance } from '../types';

export class GameSessionRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(sessionId: number) {
    const rows = await this.db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByRoomId(roomId: number) {
    return this.db.select().from(gameSessions).where(eq(gameSessions.roomId, roomId));
  }

  async create(data: { roomId: number; gameType: string; config?: unknown }) {
    const [row] = await this.db.insert(gameSessions).values(data).returning();
    return row;
  }

  async updateStore(sessionId: number, store: unknown) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ store })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }

  async updateStatus(sessionId: number, status: string) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ status })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }

  async updateStatusAndTimestamp(
    sessionId: number,
    status: string,
    timestampField: 'startedAt' | 'finishedAt',
  ) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ status, [timestampField]: new Date() })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }
}
