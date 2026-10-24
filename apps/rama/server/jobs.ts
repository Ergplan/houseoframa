// The app's side of jobs: a database connection per use, for work that outlives the request that
// started it.
import { createDb, type Db } from '@rama/db';

export async function jobDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const conn = createDb();
  try {
    return await fn(conn.db);
  } finally {
    await conn.close();
  }
}
