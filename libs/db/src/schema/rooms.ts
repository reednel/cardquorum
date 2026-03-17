import { integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  visibility: varchar('visibility', { length: 20 }).notNull().default('public'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
