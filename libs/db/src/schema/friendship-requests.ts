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

export const friendshipRequests = pgTable(
  'friendship_requests',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: integer('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('friendship_requests_pair_unique').on(
      sql`LEAST(${table.requesterId}, ${table.addresseeId})`,
      sql`GREATEST(${table.requesterId}, ${table.addresseeId})`,
    ),
    index('friendship_requests_addressee_id_idx').on(table.addresseeId),
    check('friendship_requests_no_self', sql`${table.requesterId} <> ${table.addresseeId}`),
  ],
);
