import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authMethod: varchar('auth_method', { length: 16 }).notNull().default('basic'),
    /** IdP session ID from the `sid` claim — used for targeted backchannel logout. */
    oidcSid: text('oidc_sid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('idx_sessions_user_id').on(t.userId), index('idx_sessions_oidc_sid').on(t.oidcSid)],
);
