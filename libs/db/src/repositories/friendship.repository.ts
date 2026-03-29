import { and, eq, or } from 'drizzle-orm';
import { friendships, users } from '../schema';
import { DbInstance } from '../types';

export class FriendshipRepository {
  constructor(private readonly db: DbInstance) {}

  async create(userId1: number, userId2: number) {
    const [row] = await this.db.insert(friendships).values({ userId1, userId2 }).returning();
    return row;
  }

  async findById(id: number) {
    const rows = await this.db.select().from(friendships).where(eq(friendships.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findBetweenUsers(userA: number, userB: number) {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId1, userA), eq(friendships.userId2, userB)),
          and(eq(friendships.userId1, userB), eq(friendships.userId2, userA)),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findFriends(userId: number) {
    const rows = await this.db
      .select({
        id: friendships.id,
        createdAt: friendships.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.userId1, userId), eq(friendships.userId2, users.id)),
          and(eq(friendships.userId2, userId), eq(friendships.userId1, users.id)),
        ),
      );

    return rows;
  }

  async deleteById(id: number) {
    const [row] = await this.db
      .delete(friendships)
      .where(eq(friendships.id, id))
      .returning({ id: friendships.id });
    return row ?? null;
  }

  async deleteBetweenUsers(userA: number, userB: number) {
    const [row] = await this.db
      .delete(friendships)
      .where(
        or(
          and(eq(friendships.userId1, userA), eq(friendships.userId2, userB)),
          and(eq(friendships.userId1, userB), eq(friendships.userId2, userA)),
        ),
      )
      .returning({ id: friendships.id });
    return row ?? null;
  }

  async areFriends(userA: number, userB: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId1, userA), eq(friendships.userId2, userB)),
          and(eq(friendships.userId1, userB), eq(friendships.userId2, userA)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async findFriendIds(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ userId1: friendships.userId1, userId2: friendships.userId2 })
      .from(friendships)
      .where(or(eq(friendships.userId1, userId), eq(friendships.userId2, userId)));
    return rows.map((r) => (r.userId1 === userId ? r.userId2 : r.userId1));
  }
}
