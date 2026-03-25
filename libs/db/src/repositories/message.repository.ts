import { and, desc, eq, notInArray } from 'drizzle-orm';
import { ChatMessagePayload } from '@cardquorum/shared';
import { messages } from '../schema';
import { DbInstance } from '../types';

export class MessageRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(
    roomId: number,
    senderUserId: number,
    senderDisplayName: string,
    content: string,
  ): Promise<ChatMessagePayload> {
    const [row] = await this.db
      .insert(messages)
      .values({ roomId, senderUserId, senderDisplayName, content })
      .returning();

    return {
      id: row.id,
      roomId: row.roomId,
      senderUserId: row.senderUserId,
      senderDisplayName: row.senderDisplayName,
      content: row.content,
      sentAt: row.sentAt.toISOString(),
    };
  }

  async findByRoomId(roomId: number, limit = 50): Promise<ChatMessagePayload[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.sentAt))
      .limit(limit);

    return rows.reverse().map((row) => ({
      id: row.id,
      roomId: row.roomId,
      senderUserId: row.senderUserId,
      senderDisplayName: row.senderDisplayName,
      content: row.content,
      sentAt: row.sentAt.toISOString(),
    }));
  }

  async deleteBySenderExcludingRooms(senderUserId: number, excludeRoomIds: number[]) {
    const conditions = [eq(messages.senderUserId, senderUserId)];
    if (excludeRoomIds.length > 0) {
      conditions.push(notInArray(messages.roomId, excludeRoomIds));
    }
    return this.db
      .delete(messages)
      .where(and(...conditions))
      .returning({ id: messages.id });
  }
}
