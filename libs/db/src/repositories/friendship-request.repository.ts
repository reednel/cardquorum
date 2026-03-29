import { and, eq, or } from 'drizzle-orm';
import { friendshipRequests, users } from '../schema';
import { DbInstance } from '../types';

export class FriendshipRequestRepository {
  constructor(private readonly db: DbInstance) {}

  async create(requesterId: number, addresseeId: number) {
    const [row] = await this.db
      .insert(friendshipRequests)
      .values({ requesterId, addresseeId })
      .returning();
    return row;
  }

  async findById(id: number) {
    const rows = await this.db
      .select()
      .from(friendshipRequests)
      .where(eq(friendshipRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findBetweenUsers(userA: number, userB: number) {
    const rows = await this.db
      .select()
      .from(friendshipRequests)
      .where(
        or(
          and(eq(friendshipRequests.requesterId, userA), eq(friendshipRequests.addresseeId, userB)),
          and(eq(friendshipRequests.requesterId, userB), eq(friendshipRequests.addresseeId, userA)),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findIncomingRequests(userId: number) {
    return this.db
      .select({
        id: friendshipRequests.id,
        createdAt: friendshipRequests.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendshipRequests)
      .innerJoin(users, eq(friendshipRequests.requesterId, users.id))
      .where(eq(friendshipRequests.addresseeId, userId));
  }

  async findOutgoingRequests(userId: number) {
    return this.db
      .select({
        id: friendshipRequests.id,
        createdAt: friendshipRequests.createdAt,
        otherUserId: users.id,
        otherUsername: users.username,
        otherDisplayName: users.displayName,
      })
      .from(friendshipRequests)
      .innerJoin(users, eq(friendshipRequests.addresseeId, users.id))
      .where(eq(friendshipRequests.requesterId, userId));
  }

  async deleteById(id: number) {
    const [row] = await this.db
      .delete(friendshipRequests)
      .where(eq(friendshipRequests.id, id))
      .returning({ id: friendshipRequests.id });
    return row ?? null;
  }
}
