import { execSync } from 'child_process';
import postgres from 'postgres';
import { getAdminDatabaseUrl, getTestDatabaseUrl } from '../helpers/env';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = getTestDatabaseUrl();
  const adminSql = postgres(getAdminDatabaseUrl());

  try {
    await adminSql`CREATE DATABASE cardquorum_test`;
  } catch (err: unknown) {
    // Ignore "already exists" error (PostgreSQL error code 42P04)
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code !== '42P04'
    ) {
      throw err;
    }
  } finally {
    await adminSql.end();
  }

  // Run Drizzle migrations against the test database
  execSync('pnpm drizzle-kit migrate --config ./libs/db/drizzle.config.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
