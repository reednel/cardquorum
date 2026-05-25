import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    gameType: varchar('game_type', { length: 50 }).notNull(),
    variant: varchar('variant', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('waiting'),
    config: jsonb('config').notNull().default({}),
    store: jsonb('store').notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_game_sessions_report_filter')
      .on(table.gameType, table.status, table.finishedAt)
      .where(sql`${table.status} = 'finished'`),
    index('idx_game_sessions_variant')
      .on(table.variant)
      .where(sql`${table.variant} IS NOT NULL`),
  ],
);
