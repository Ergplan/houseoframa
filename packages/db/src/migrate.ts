import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.ts';

// Built with path.join rather than `new URL('../migrations', import.meta.url)`: the app's bundler takes
// the latter for a static asset reference and fails to build any route that imports @rama/db.
export const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

/** Applies every pending migration in packages/db/migrations. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
