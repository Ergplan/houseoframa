// The ceremony routes' dependencies on the real database, checkout and model: one place, used by every
// ceremony route. A connection is opened per call and closed after it.
import { and, asc, eq } from 'drizzle-orm';
import { createDb, discoverySessions, discoveryTurns, people } from '@rama/db';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import {
  addTurn,
  currentDecisions,
  decide,
  draftQuestion,
  listDecisions,
  listSignoffs,
  sign,
  startSession,
} from '@rama/ceremony';
import type { CeremonyDeps } from './ceremony';

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const conn = createDb();
  try {
    return await fn(conn.db);
  } finally {
    await conn.close();
  }
}

export async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const ceremonyDeps = (): CeremonyDeps => ({
  locate: (id) => locateSite(id),
  blueprint: (site) => readSiteBlueprint(site),
  capturedCommit: (site) => readCapture(site.id)?.commit ?? null,
  memberName: process.env.RAMA_MEMBER_NAME,
  personId: (name) =>
    withDb(async (db) => {
      const [p] = await db.select({ id: people.id }).from(people).where(eq(people.name, name));
      if (!p) throw new Error(`no person "${name}": run \`pnpm db:seed\``);
      return p.id;
    }),
  signoffs: (siteId) => withDb((db) => listSignoffs(db, siteId)),
  sign: (site, input) => withDb((db) => sign(db, site, input)),
  decide: (site, input) => withDb((db) => decide(db, site, input)),
  startSession: (siteId, input) => withDb((db) => startSession(db, siteId, input)),
  addTurn: (siteId, sessionId, input) => withDb((db) => addTurn(db, siteId, sessionId, input)),
  sessionTurns: (siteId, sessionId) =>
    withDb(async (db) => {
      const [s] = await db
        .select({ id: discoverySessions.id })
        .from(discoverySessions)
        .where(and(eq(discoverySessions.siteId, siteId), eq(discoverySessions.id, sessionId)));
      if (!s) return null;
      return db
        .select({ speaker: discoveryTurns.speaker, text: discoveryTurns.text })
        .from(discoveryTurns)
        .where(eq(discoveryTurns.sessionId, sessionId))
        .orderBy(asc(discoveryTurns.seq));
    }),
  decisions: (siteId) => withDb(async (db) => currentDecisions(await listDecisions(db, siteId))),
  draftQuestion: (input, siteId) => draftQuestion(input, { siteId }),
  now: () => new Date(),
});
