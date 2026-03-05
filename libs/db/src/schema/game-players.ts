import { pgTable, serial, integer, smallint, timestamp, unique } from 'drizzle-orm/pg-core';
import { gameSessions } from './game-sessions';
import { users } from './users';

export const gamePlayers = pgTable(
  'game_players',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    seatIndex: smallint('seat_index').notNull(),
    score: integer('score'),
    won: integer('won'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.sessionId, t.userId)],
);
