import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import { index, integer, pgTable, serial, smallint, uniqueIndex } from 'drizzle-orm/pg-core';
import { gameSessions } from './game-sessions';
import { users } from './users';

export const gameParticipants = pgTable(
  'game_participants',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    seatIndex: smallint('seat_index').notNull(),
  },
  (table) => [
    uniqueIndex('idx_game_participants_session_user').on(table.sessionId, table.userId),
    index('idx_game_participants_user').on(table.userId),
  ],
);

export type GameParticipant = InferSelectModel<typeof gameParticipants>;
export type NewGameParticipant = InferInsertModel<typeof gameParticipants>;
