import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  senderUserId: uuid('sender_user_id').notNull(),
  senderNickname: varchar('sender_nickname', { length: 255 }).notNull(),
  content: text('content').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
