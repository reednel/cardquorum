import { and, eq } from 'drizzle-orm';
import { roomInvites, users } from '../schema';
import { DbInstance } from '../types';

export class RoomInviteRepository {
  constructor(private readonly db: DbInstance) {}

  async create(roomId: number, userId: number) {
    const [row] = await this.db.insert(roomInvites).values({ roomId, userId }).returning();
    return row;
  }

  async createMany(roomId: number, userIds: number[]) {
    if (userIds.length === 0) return [];
    const values = userIds.map((userId) => ({ roomId, userId }));
    return this.db.insert(roomInvites).values(values).returning();
  }

  async delete(roomId: number, userId: number) {
    const [row] = await this.db
      .delete(roomInvites)
      .where(and(eq(roomInvites.roomId, roomId), eq(roomInvites.userId, userId)))
      .returning({ id: roomInvites.id });
    return row ?? null;
  }

  async findByRoom(roomId: number) {
    return this.db
      .select({
        userId: roomInvites.userId,
        username: users.username,
        displayName: users.displayName,
        createdAt: roomInvites.createdAt,
      })
      .from(roomInvites)
      .innerJoin(users, eq(roomInvites.userId, users.id))
      .where(eq(roomInvites.roomId, roomId));
  }

  async isInvited(roomId: number, userId: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: roomInvites.id })
      .from(roomInvites)
      .where(and(eq(roomInvites.roomId, roomId), eq(roomInvites.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async findInvitedRoomIds(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ roomId: roomInvites.roomId })
      .from(roomInvites)
      .where(eq(roomInvites.userId, userId));
    return rows.map((r) => r.roomId);
  }
}
