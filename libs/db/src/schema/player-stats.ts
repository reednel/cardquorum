import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { gameSessions } from './game-sessions';
import { rooms } from './rooms';
import { users } from './users';

export const playerStats = pgTable(
  'player_stats',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    gameType: varchar('game_type', { length: 50 }).notNull(),
    won: boolean('won'),
    scoreDelta: integer('score_delta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_player_stats_session_user').on(table.sessionId, table.userId),
    index('idx_player_stats_user_room').on(table.userId, table.roomId),
    index('idx_player_stats_user').on(table.userId),
  ],
);

export type PlayerStat = InferSelectModel<typeof playerStats>;
export type NewPlayerStat = InferInsertModel<typeof playerStats>;
