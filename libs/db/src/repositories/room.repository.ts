import { eq, sql } from 'drizzle-orm';
import { rooms, users } from '../schema';
import { DbInstance } from '../types';

export class RoomRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(roomId: number) {
    const rows = await this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        visibility: rooms.visibility,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id))
      .where(eq(rooms.id, roomId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAll(visibility?: string) {
    const query = this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        visibility: rooms.visibility,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id));

    if (visibility) {
      return query.where(eq(rooms.visibility, visibility));
    }
    return query;
  }

  async create(name: string, ownerId: number, visibility = 'public') {
    const [row] = await this.db.insert(rooms).values({ name, ownerId, visibility }).returning();
    return row;
  }

  async update(roomId: number, fields: { name?: string; visibility?: string }) {
    const [row] = await this.db
      .update(rooms)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(rooms.id, roomId))
      .returning();
    return row ?? null;
  }

  async delete(roomId: number) {
    const [row] = await this.db
      .delete(rooms)
      .where(eq(rooms.id, roomId))
      .returning({ id: rooms.id });
    return row ?? null;
  }
}
