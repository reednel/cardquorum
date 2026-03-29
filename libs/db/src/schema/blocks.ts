import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const blocks = pgTable(
  'blocks',
  {
    id: serial('id').primaryKey(),
    blockerId: integer('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: integer('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('blocks_pair_unique').on(table.blockerId, table.blockedId),
    index('blocks_blocked_id_idx').on(table.blockedId),
    check('blocks_no_self', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);
