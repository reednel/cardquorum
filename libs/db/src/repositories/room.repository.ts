import { eq } from 'drizzle-orm';
import { rooms } from '../schema';
import { DbInstance } from '../types';

export class RoomRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(roomId: number) {
    const rows = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    return rows[0] ?? null;
  }

  async create(name: string) {
    const [row] = await this.db.insert(rooms).values({ name }).returning();
    return row;
  }
}
