// Plain settings (Stage 7), kept in Postgres beside the keys: things a person sets in the Settings
// screen that are not secret, such as the GitHub account products are created under.
import { eq } from 'drizzle-orm';
import type { Db } from './client.ts';
import { settings } from './schema.ts';

export const GITHUB_OWNER = 'github.owner';

export async function getSetting<T>(db: Db, key: string): Promise<T | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : undefined;
}

export async function putSetting(db: Db, key: string, value: unknown, by: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: value as object, updatedBy: by, createdBy: by })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as object, updatedBy: by, updatedAt: new Date() },
    });
}
