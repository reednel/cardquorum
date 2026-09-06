import { eq } from 'drizzle-orm';
import { gameParticipants, type GameParticipant, type NewGameParticipant } from '../schema';
import { type DbInstance } from '../types';

export class GameParticipantRepository {
  constructor(private readonly db: DbInstance) {}

  async batchInsert(participants: NewGameParticipant[]): Promise<void> {
    if (participants.length === 0) return;
    await this.db.insert(gameParticipants).values(participants);
  }

  async findByUserId(userId: number): Promise<GameParticipant[]> {
    return this.db.select().from(gameParticipants).where(eq(gameParticipants.userId, userId));
  }

  async findBySessionId(sessionId: number): Promise<GameParticipant[]> {
    return this.db.select().from(gameParticipants).where(eq(gameParticipants.sessionId, sessionId));
  }
}
