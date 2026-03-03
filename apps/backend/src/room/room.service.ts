import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RoomManager } from '@cardquorum/engine';
import { DRIZZLE } from '../drizzle/drizzle.module';
import { rooms } from '../drizzle/schema';

@Injectable()
export class RoomService {
  readonly manager = new RoomManager();

  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** Ensure the room exists in Postgres (upsert by id). */
  async ensureRoomExists(roomId: string): Promise<void> {
    const existing = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (existing.length === 0) {
      await this.db.insert(rooms).values({ id: roomId, name: roomId });
    }
  }
}
