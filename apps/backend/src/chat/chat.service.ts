import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { ChatMessagePayload } from '@cardquorum/shared';
import { DRIZZLE } from '../drizzle/drizzle.module';
import { messages } from '../drizzle/schema';

@Injectable()
export class ChatService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async saveMessage(
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

  async getRecentMessages(roomId: string, limit = 50): Promise<ChatMessagePayload[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.sentAt))
      .limit(limit);

    return rows.reverse().map((row: any) => ({
      id: row.id,
      roomId: row.roomId,
      senderUserId: row.senderUserId,
      senderNickname: row.senderNickname,
      content: row.content,
      sentAt: row.sentAt.toISOString(),
    }));
  }
}
