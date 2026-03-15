import { integer, pgTable, serial, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userCredentials = pgTable(
  'user_credentials',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    credential: varchar('credential', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.method)],
);
