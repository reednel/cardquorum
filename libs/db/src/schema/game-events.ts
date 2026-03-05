import { pgTable, serial, integer, varchar, smallint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { gameSessions } from './game-sessions';
import { users } from './users';

export const gameEvents = pgTable('game_events', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .notNull()
    .references(() => gameSessions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id),
  seq: smallint('seq').notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
