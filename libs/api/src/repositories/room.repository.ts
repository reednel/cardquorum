import { eq } from 'drizzle-orm';
import { rooms } from '../schema';
import { DbInstance } from '../types';

export class RoomRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(roomId: string) {
    const rows = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    return rows[0] ?? null;
  }

  async create(id: string, name: string) {
    const [row] = await this.db.insert(rooms).values({ id, name }).returning();
    return row;
  }

  /** Insert the room if it doesn't already exist. */
  async ensureExists(roomId: string): Promise<void> {
    const existing = await this.findById(roomId);
    if (!existing) {
      await this.db.insert(rooms).values({ id: roomId, name: roomId });
    }
  }
}
