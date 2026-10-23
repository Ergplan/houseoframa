// Writes an imported record (imports.ts) to a site, append-only. A first import of a source becomes a
// reconstructed session with its turns and cards. A source already imported is reconciled, never
// rewritten: a corrected parse adds a correction session holding only the cards that are new, each
// changed card superseding the one recorded before (planReimport).
import { and, eq, like, or } from 'drizzle-orm';
import { discoverySessions, type Db } from '@rama/db';
import { planReimport, type ImportedSession } from './imports.ts';
import { addTurn, decide, listDecisions, startSession, type SiteRef } from './store.ts';

export const IMPORT_COMPONENT = 'rama:ceremony-import@0.1.0';

export interface ImportOutcome {
  sessionId: string | null;
  turns: number;
  added: number;
  superseded: number;
  unchanged: number;
  /** Recorded cards the source no longer has: reported, never removed. */
  orphaned: string[];
}

export async function importRecord(
  db: Db,
  site: SiteRef,
  imported: ImportedSession,
): Promise<ImportOutcome> {
  const earlier = await db
    .select()
    .from(discoverySessions)
    .where(
      and(
        eq(discoverySessions.siteId, site.id),
        or(
          eq(discoverySessions.source, imported.source),
          like(discoverySessions.source, `${imported.source} (correction %)`),
        ),
      ),
    );
  if (earlier.length && imported.turns.length) {
    throw new Error(
      `${imported.source} is already imported for "${site.id}" with its turns; a session's turns are not re-imported`,
    );
  }
  const ids = new Set(earlier.map((s) => s.id));
  const recorded = (await listDecisions(db, site.id)).filter(
    (d) => d.sessionId && ids.has(d.sessionId),
  );
  const plan = earlier.length
    ? planReimport(recorded, imported.decisions)
    : { add: imported.decisions, unchanged: 0, orphaned: [] };
  const outcome: ImportOutcome = {
    sessionId: null,
    turns: imported.turns.length,
    added: plan.add.filter((d) => !('supersedes' in d && d.supersedes)).length,
    superseded: plan.add.filter((d) => 'supersedes' in d && d.supersedes).length,
    unchanged: plan.unchanged,
    orphaned: plan.orphaned.map((d) => d.id),
  };
  if (!plan.add.length && earlier.length) return outcome;
  const sessionId = await startSession(db, site.id, {
    title: earlier.length
      ? `Correction of the import of ${imported.source} (reconstructed)`
      : imported.title,
    reconstructed: true,
    source: earlier.length ? `${imported.source} (correction ${earlier.length})` : imported.source,
    createdBy: IMPORT_COMPONENT,
  });
  outcome.sessionId = sessionId;
  for (const t of imported.turns) {
    await addTurn(db, site.id, sessionId, {
      speaker: t.speaker,
      text: t.text,
      at: new Date(t.at),
      createdBy: IMPORT_COMPONENT,
    });
  }
  for (const d of plan.add) {
    await decide(db, site, {
      ...d,
      at: new Date(d.at),
      sessionId,
      reconstructed: true,
      createdBy: IMPORT_COMPONENT,
    });
  }
  return outcome;
}
