import { and, eq, ilike, ne, notInArray, sql } from 'drizzle-orm';
import { messages, rooms, userCredentials, users } from '../schema';
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

  async updateUsername(id: number, username: string) {
    const [row] = await this.db
      .update(users)
      .set({ username, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
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

  /**
   * Soft-deletes a user in a single transaction: deletes messages (except in
   * owned rooms), deletes owned rooms, deletes credentials, then anonymizes
   * the user row.  CASCADE won't fire on UPDATE, so credentials must be
   * cleaned up explicitly.
   */
  async softDelete(userId: number, anonUsername: string, ownedRoomIds: number[]) {
    await this.db.transaction(async (tx) => {
      // Delete messages in rooms the user doesn't own
      const msgConditions = [eq(messages.senderUserId, userId)];
      if (ownedRoomIds.length > 0) {
        msgConditions.push(notInArray(messages.roomId, ownedRoomIds));
      }
      await tx.delete(messages).where(and(...msgConditions));

      // Delete owned rooms (cascades to messages in those rooms)
      await tx.delete(rooms).where(eq(rooms.ownerId, userId));

      // Delete credentials (CASCADE won't fire on soft-delete)
      await tx.delete(userCredentials).where(eq(userCredentials.userId, userId));

      // Anonymize user row
      await tx
        .update(users)
        .set({
          username: anonUsername,
          displayName: anonUsername,
          email: null,
          updatedAt: sql`now()`,
          deletedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
    });
  }
}
