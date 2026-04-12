import { boolean, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: varchar('description', { length: 256 }),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  visibility: varchar('visibility', { length: 20 }).notNull().default('public'),
  memberLimit: integer('member_limit'),
  rotatePlayers: boolean('rotate_players').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
