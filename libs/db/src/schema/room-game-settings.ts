import { boolean, integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';

export const roomGameSettings = pgTable('room_game_settings', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id')
    .notNull()
    .unique()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  gameType: varchar('game_type', { length: 50 }),
  presetName: varchar('preset_name', { length: 100 }),
  config: jsonb('config').notNull().default({}),
  autostart: boolean('autostart').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
