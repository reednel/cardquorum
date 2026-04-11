import postgres from 'postgres';
import { getTestDatabaseUrl } from './env';

let sql: ReturnType<typeof postgres> | null = null;

function getConnection(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(getTestDatabaseUrl());
  }
  return sql;
}

/**
 * Truncate all user-data tables in the test database.
 * Uses CASCADE to handle foreign key constraints.
 */
export async function truncateAllTables(): Promise<void> {
  const db = getConnection();
  await db.unsafe(`
    TRUNCATE
      messages,
      game_sessions,
      room_game_settings,
      room_bans,
      room_invites,
      room_rosters,
      rooms,
      blocks,
      friendship_requests,
      friendships,
      sessions,
      user_credentials,
      users
    CASCADE
  `);
}

/** Close the database connection. Call during teardown. */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
