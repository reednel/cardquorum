import { and, eq, ilike, ne, sql } from 'drizzle-orm';
import { users } from '../schema';
import { DbInstance } from '../types';

export class UserRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(id: number) {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByUsername(username: string) {
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0] ?? null;
  }

  async create(data: { username: string; displayName: string; email?: string }) {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  async updateDisplayName(id: number, displayName: string) {
    const [row] = await this.db
      .update(users)
      .set({ displayName, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  }

  async searchByUsername(query: string, excludeUserId: number, limit = 20) {
    const escaped = query.replace(/[%_]/g, '\\$&');
    return this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(and(ilike(users.username, `${escaped}%`), ne(users.id, excludeUserId)))
      .orderBy(users.username)
      .limit(limit);
  }
}
