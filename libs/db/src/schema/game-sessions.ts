import { integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  gameType: varchar('game_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('waiting'),
  config: jsonb('config').notNull().default({}),
  store: jsonb('store').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
