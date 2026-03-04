import { desc, eq } from 'drizzle-orm';
import { ChatMessagePayload } from '@cardquorum/shared';
import { messages } from '../schema';
import { DbInstance } from '../types';

export class MessageRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(
    roomId: string,
    senderUserId: string,
    senderNickname: string,
    content: string,
  ): Promise<ChatMessagePayload> {
    const [row] = await this.db
      .insert(messages)
      .values({ roomId, senderUserId, senderNickname, content })
      .returning();

    return {
      id: row.id,
      roomId: row.roomId,
      senderUserId: row.senderUserId,
      senderNickname: row.senderNickname,
      content: row.content,
      sentAt: row.sentAt.toISOString(),
    };
  }

  async findByRoomId(roomId: string, limit = 50): Promise<ChatMessagePayload[]> {
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
      senderNickname: row.senderNickname,
      content: row.content,
      sentAt: row.sentAt.toISOString(),
    }));
  }
}
