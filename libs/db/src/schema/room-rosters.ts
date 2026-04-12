import {
  index,
  integer,
  pgTable,
  serial,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { rooms } from './rooms';
import { users } from './users';

export const roomRosters = pgTable(
  'room_rosters',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    section: varchar('section', { length: 20 }).notNull().default('spectators'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastVisitedAt: timestamp('last_visited_at', { withTimezone: true }).notNull().defaultNow(),
    assignedHue: smallint('assigned_hue'),
  },
  (table) => [
    uniqueIndex('room_rosters_pair_unique').on(table.roomId, table.userId),
    index('room_rosters_room_id_idx').on(table.roomId),
  ],
);
