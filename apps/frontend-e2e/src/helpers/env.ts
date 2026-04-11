/**
 * Shared environment helpers for e2e tests.
 * Single source of truth for database URLs and base URL.
 */

export function getTestDatabaseUrl(): string {
  if (process.env['E2E_DATABASE_URL']) {
    return process.env['E2E_DATABASE_URL'];
  }
  const base = process.env['DATABASE_URL'];
  if (base) {
    return base.replace(/\/[^/]+$/, '/cardquorum_test');
  }
  return 'postgresql://cardquorum:password@localhost:5432/cardquorum_test';
}

export function getAdminDatabaseUrl(): string {
  return (
    process.env['DATABASE_URL'] || 'postgresql://cardquorum:password@localhost:5432/cardquorum'
  );
}

export function getBaseUrl(): string {
  return process.env['E2E_BASE_URL'] || 'http://localhost:4200';
}
