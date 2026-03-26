import { and, eq, gt, isNull } from 'drizzle-orm';
import { sessions, users } from '../schema';
import { DbInstance } from '../types';

export class SessionRepository {
  constructor(private readonly db: DbInstance) {}

  // TODO: discuss why we pass in the session id instead of generating it in the database
  async create(id: string, userId: number, authMethod: 'basic' | 'oidc') {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await this.db
      .insert(sessions)
      .values({ id, userId, authMethod, expiresAt })
      .returning();
    return row;
  }

  async findValidSession(id: string) {
    const rows = await this.db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        authMethod: sessions.authMethod,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteById(id: string) {
    const [row] = await this.db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });
    return row ?? null;
  }

  async deleteAllByUserId(userId: number) {
    return this.db
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning({ id: sessions.id });
  }
}
