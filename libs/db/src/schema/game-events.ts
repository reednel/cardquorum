import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { gameSessions } from './game-sessions';
import { rooms } from './rooms';

export const gameEvents = pgTable(
  'game_events',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: integer('user_id'),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    message: varchar('message', { length: 500 }),
    seq: smallint('seq').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_game_events_room_created').on(table.roomId, table.createdAt),
    uniqueIndex('idx_game_events_session_seq').on(table.sessionId, table.seq),
  ],
);

export type GameEvent = InferSelectModel<typeof gameEvents>;
export type NewGameEvent = InferInsertModel<typeof gameEvents>;
