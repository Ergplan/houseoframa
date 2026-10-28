// The product's own database. House of Rama hands the running app DATABASE_URL (a database for this
// product alone) and RAMA_SITE_ID (the product's id, for each row's site_id). Without them (the tests,
// `next build`) `database()` is null and a building reads its sample rows from data/<table>.json.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let db: PostgresJsDatabase<typeof schema> | undefined;

/** The database, or null when none is connected. */
export function database(): PostgresJsDatabase<typeof schema> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  db ??= drizzle(postgres(url, { max: 3 }), { schema });
  return db;
}

/** The product's id, written into each row's site_id. */
export const siteId = (): string => process.env.RAMA_SITE_ID ?? 'this-product';
