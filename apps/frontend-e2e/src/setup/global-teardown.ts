import { closeDb, truncateAllTables } from '../helpers/db';

export default async function globalTeardown(): Promise<void> {
  await truncateAllTables();
  await closeDb();
}
