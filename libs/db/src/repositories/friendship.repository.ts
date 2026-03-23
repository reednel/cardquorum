import { and, eq, or, sql } from 'drizzle-orm';
import { friendships, users } from '../schema';
import { DbInstance } from '../types';

export class FriendshipRepository {
  constructor(private readonly db: DbInstance) {}

  async create(requesterId: number, addresseeId: number) {
    const [row] = await this.db
      .insert(friendships)
      .values({ requesterId, addresseeId })
      .returning();
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
          and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
          and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA)),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findFriends(userId: number) {
    const asRequester = await this.db
      .select({
        id: friendships.id,
        status: friendships.status,
        createdAt: friendships.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.addresseeId, users.id))
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'accepted')));

    const asAddressee = await this.db
      .select({
        id: friendships.id,
        status: friendships.status,
        createdAt: friendships.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.requesterId, users.id))
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'accepted')));

    return [...asRequester, ...asAddressee];
  }

  async findIncomingRequests(userId: number) {
    return this.db
      .select({
        id: friendships.id,
        status: friendships.status,
        createdAt: friendships.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.requesterId, users.id))
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')));
  }

  async findOutgoingRequests(userId: number) {
    return this.db
      .select({
        id: friendships.id,
        status: friendships.status,
        createdAt: friendships.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.addresseeId, users.id))
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')));
  }

  async accept(id: number) {
    const [row] = await this.db
      .update(friendships)
      .set({ status: 'accepted', updatedAt: sql`now()` })
      .where(eq(friendships.id, id))
      .returning();
    return row ?? null;
  }

  async deleteById(id: number) {
    const [row] = await this.db
      .delete(friendships)
      .where(eq(friendships.id, id))
      .returning({ id: friendships.id });
    return row ?? null;
  }

  async areFriends(userA: number, userB: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(
          or(
            and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
            and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA)),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async findFriendIds(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, 'accepted'),
        ),
      );
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }
}
