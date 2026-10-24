// A signed-in member for an end-to-end test (Stage 6): every page and site route needs a session and a
// site the member owns. The browser carries the session cookie, and plain fetches send it as a header.
// (The sign-in form itself is driven in tests/stage-6.e2e.test.ts.)
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import type { Browser, BrowserContextOptions, Page } from 'playwright';
import { createDb, ensurePerson, openSession, runMigrations, seed, sites } from '@rama/db';
import type { DevServer } from './dev-server.ts';

/** A fresh database on the DATABASE_URL server, migrated and seeded with `memberName` owning "self". */
export async function throwawayDb(
  memberName: string,
): Promise<{ url: string; drop: () => Promise<void> }> {
  const serverUrl = process.env.DATABASE_URL!;
  const name = `rama_test_${randomBytes(4).toString('hex')}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = Object.assign(new URL(serverUrl), { pathname: `/${name}` }).toString();
  const conn = createDb(url);
  await runMigrations(conn.db);
  await seed(conn.db, { memberName });
  await conn.close();
  return {
    url,
    drop: async () => {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

/** Makes the member own `siteIds` (registered if new) and opens a session for them. */
export async function signIn(
  url: string,
  member: { name: string; role?: 'member' | 'manager' },
  siteIds: { id: string; name: string; repo: string }[] = [],
): Promise<string> {
  const conn = createDb(url);
  try {
    const m = await ensurePerson(
      conn.db,
      { name: member.name, role: member.role ?? 'member' },
      'rama:e2e@0',
    );
    for (const s of siteIds) {
      await conn.db
        .insert(sites)
        .values({
          siteId: s.id,
          name: s.name,
          repo: s.repo,
          memberId: m.id,
          createdBy: 'rama:e2e@0',
        })
        .onConflictDoNothing();
    }
    return await openSession(conn.db, m.id);
  } finally {
    await conn.close();
  }
}

export const withSession = (token: string) => ({ cookie: `rama_session=${token}` });

/** A browser page signed in as the session's member, on the dev server's own origin. */
export async function pageAs(
  browser: Browser,
  server: DevServer,
  token: string,
  opts: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext(opts);
  await context.addCookies([{ name: 'rama_session', value: token, url: server.browserUrl }]);
  return context.newPage();
}
