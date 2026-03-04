import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';
import { users } from './users';

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  senderUserId: integer('sender_user_id')
    .notNull()
    .references(() => users.id),
  senderDisplayName: varchar('sender_display_name', { length: 255 }).notNull(),
  content: text('content').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
