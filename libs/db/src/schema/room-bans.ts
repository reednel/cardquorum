import { index, integer, pgTable, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';
import { users } from './users';

export const roomBans = pgTable(
  'room_bans',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('room_bans_pair_unique').on(table.roomId, table.userId),
    index('room_bans_user_id_idx').on(table.userId),
  ],
);
