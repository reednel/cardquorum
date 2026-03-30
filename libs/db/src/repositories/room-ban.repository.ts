import { and, eq } from 'drizzle-orm';
import { roomBans, users } from '../schema';
import { DbInstance } from '../types';

export class RoomBanRepository {
  constructor(private readonly db: DbInstance) {}

  async create(roomId: number, userId: number) {
    const [row] = await this.db.insert(roomBans).values({ roomId, userId }).returning();
    return row;
  }

  async delete(roomId: number, userId: number) {
    const [row] = await this.db
      .delete(roomBans)
      .where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId)))
      .returning({ id: roomBans.id });
    return row ?? null;
  }

  async findByRoom(roomId: number) {
    return this.db
      .select({
        userId: roomBans.userId,
        username: users.username,
        displayName: users.displayName,
        createdAt: roomBans.createdAt,
      })
      .from(roomBans)
      .innerJoin(users, eq(roomBans.userId, users.id))
      .where(eq(roomBans.roomId, roomId));
  }

  async isBanned(roomId: number, userId: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: roomBans.id })
      .from(roomBans)
      .where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async findBannedRoomIds(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ roomId: roomBans.roomId })
      .from(roomBans)
      .where(eq(roomBans.userId, userId));
    return rows.map((r) => r.roomId);
  }
}
