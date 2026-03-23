import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const friendships = pgTable(
  'friendships',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: integer('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('friendships_pair_unique').on(
      sql`LEAST(${table.requesterId}, ${table.addresseeId})`,
      sql`GREATEST(${table.requesterId}, ${table.addresseeId})`,
    ),
    index('friendships_addressee_id_idx').on(table.addresseeId),
    check('friendships_no_self', sql`${table.requesterId} <> ${table.addresseeId}`),
  ],
);
