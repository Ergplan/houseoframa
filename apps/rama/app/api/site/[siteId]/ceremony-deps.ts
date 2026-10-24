// The ceremony routes' dependencies on the real database, checkout and model: one place, used by every
// ceremony route. A connection is opened per call and closed after it.
import { and, asc, eq } from 'drizzle-orm';
import { createDb, discoverySessions, discoveryTurns, type Member } from '@rama/db';
import { readSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
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
import { requireSealer } from '@rama/ceremony/seal';
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

/**
 * The deps for one authorized request: the site is the one the signed-in member owns (server/authorize),
 * and every write is made as that member.
 */
export const ceremonyDeps = (auth: { member: Member; site: SiteLocation }): CeremonyDeps => ({
  locate: (id) => (id === auth.site.id ? auth.site : null),
  blueprint: (site) => readSiteBlueprint(site),
  capturedCommit: (site) => readCapture(site.id)?.commit ?? null,
  memberName: auth.member.name,
  personId: async () => auth.member.id,
  signoffs: (siteId) => withDb((db) => listSignoffs(db, siteId)),
  // Every signature the app writes is sealed with House of Rama's key; without one, signing is refused.
  sign: (site, input) => withDb((db) => sign(db, site, { ...input, sealer: requireSealer() })),
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
