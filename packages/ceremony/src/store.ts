// Writes of the ceremony: discovery sessions and turns, decision cards, signatures. Each is an insert into
// an append-only table (the database refuses UPDATE and DELETE, and audits decisions and signoffs by
// trigger), and decisions and signoffs are mirrored to the target's `.rama/decisions.jsonl` and
// `.rama/signoffs.jsonl` so the record travels with the code.
//
// A site's writes are serialised by one advisory lock: the chain check and the insert run in one
// transaction holding it, and the mirror is written afterwards in a second one, from the committed rows.
// So the file never holds a row the database does not, and two writers never append at once. A line
// that could not be written (a crash, a full disk) is appended by the next write (`syncMirror`): the
// mirror lags, never lies, and is repaired forward, append-only.
import { asc, eq, sql } from 'drizzle-orm';
import type { Decision, Signoff } from '@rama/shared';
import { decisions, discoverySessions, discoveryTurns, signoffs, type Db } from '@rama/db';
import { randomUUID } from 'node:crypto';
import { checkChain, DECISIONS_FILE, SIGNOFFS_FILE, syncMirror } from './records.ts';
import type { Sealer } from './seal.ts';

const lockSite = (tx: Db, siteId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext('rama-ceremony'), hashtext(${siteId}))`);

/** Runs `fn` in a transaction holding the site's ceremony lock until it commits or rolls back. */
const underSiteLock = <T>(db: Db, siteId: string, fn: (tx: Db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await lockSite(tx as unknown as Db, siteId);
    return fn(tx as unknown as Db);
  });

/** The row is recorded (and returned as `record`), but its mirror line could not be written yet. */
export class MirrorError extends Error {
  override name = 'MirrorError';
  constructor(
    message: string,
    readonly record: Decision | Signoff,
  ) {
    super(message);
  }
}

/** After a committed insert: the mirror catches up with every committed row of the site, the new one included. */
async function publish(
  db: Db,
  site: SiteRef,
  file: string,
  rows: (tx: Db) => Promise<(Decision | Signoff)[]>,
  record: Decision | Signoff,
): Promise<void> {
  try {
    // Under the lock again, after the commit: no other writer appends at the same time.
    await underSiteLock(
      db,
      site.id,
      async (tx) => void syncMirror(site.repoDir, file, await rows(tx)),
    );
  } catch (err) {
    throw new MirrorError(
      `${record.id} is recorded, but ${file} could not be written (${(err as Error).message}); the next write appends it`,
      record,
    );
  }
}

export interface SiteRef {
  id: string;
  /** The target's checkout, where `.rama/` lives. */
  repoDir: string;
}

const toSignoff = (r: typeof signoffs.$inferSelect): Signoff => ({
  id: r.id,
  siteId: r.siteId,
  person: r.person,
  target: { kind: r.targetKind, id: r.targetId, commit: r.targetCommit },
  statement: r.statement,
  at: r.at.toISOString(),
  ...(r.supersedes ? { supersedes: r.supersedes } : {}),
  ...(r.withdrawn ? { withdrawn: true } : {}),
  ...(r.seal ? { seal: r.seal } : {}),
});

const toDecision = (r: typeof decisions.$inferSelect): Decision => ({
  id: r.id,
  siteId: r.siteId,
  title: r.title,
  statement: r.statement,
  bricks: r.bricks,
  ...(r.screenId ? { screenId: r.screenId } : {}),
  ...(r.sessionId ? { sessionId: r.sessionId } : {}),
  status: r.status,
  by: r.by,
  at: r.at.toISOString(),
  ...(r.reconstructed ? { reconstructed: true } : {}),
  ...(r.supersedes ? { supersedes: r.supersedes } : {}),
});

/** Rows in the order they were recorded, which is the order of their mirror lines. */
export async function listSignoffs(db: Db, siteId: string): Promise<Signoff[]> {
  return (
    await db
      .select()
      .from(signoffs)
      .where(eq(signoffs.siteId, siteId))
      .orderBy(asc(signoffs.createdAt), asc(signoffs.id))
  ).map(toSignoff);
}

export async function listDecisions(db: Db, siteId: string): Promise<Decision[]> {
  return (
    await db
      .select()
      .from(decisions)
      .where(eq(decisions.siteId, siteId))
      .orderBy(asc(decisions.createdAt), asc(decisions.id))
  ).map(toDecision);
}

/** The cards in force: a card superseded by a later one is left out. */
export const currentDecisions = (all: Decision[]) => {
  const superseded = new Set(all.map((d) => d.supersedes).filter(Boolean));
  return all.filter((d) => !superseded.has(d.id));
};

export interface SignInput {
  person: string;
  personId: string;
  target: Signoff['target'];
  statement: string;
  supersedes?: string;
  withdrawn?: boolean;
  at: Date;
  /** Seals the record with House of Rama's key (seal.ts). Required: no signature is written unsealed. */
  sealer: Sealer;
}

/** A named signature: one append-only row (audited by trigger) and one line in `.rama/signoffs.jsonl`. */
export async function sign(db: Db, site: SiteRef, input: SignInput): Promise<Signoff> {
  const record = await underSiteLock(db, site.id, async (one) => {
    const existing = await listSignoffs(one, site.id);
    // The record is complete before the insert (its id made here), so its seal covers exactly what the
    // row and the mirrored line hold.
    const draft: Signoff = {
      id: randomUUID(),
      siteId: site.id,
      person: input.person,
      target: input.target,
      statement: input.statement,
      at: input.at.toISOString(),
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
      ...(input.withdrawn ? { withdrawn: true } : {}),
    };
    checkChain(existing, draft);
    const seal = input.sealer.seal(draft);
    const [row] = await one
      .insert(signoffs)
      .values({
        id: draft.id,
        seal,
        siteId: site.id,
        person: input.person,
        personId: input.personId,
        targetKind: input.target.kind,
        targetId: input.target.id,
        targetCommit: input.target.commit,
        statement: input.statement,
        at: input.at,
        supersedes: input.supersedes ?? null,
        withdrawn: Boolean(input.withdrawn),
        createdBy: input.personId,
      })
      .returning();
    return toSignoff(row!);
  });
  await publish(db, site, SIGNOFFS_FILE, (tx) => listSignoffs(tx, site.id), record);
  return record;
}

export interface DecideInput {
  title: string;
  statement: string;
  bricks: string[];
  screenId?: string;
  status: Decision['status'];
  by: string;
  at: Date;
  sessionId?: string;
  reconstructed?: boolean;
  supersedes?: string;
  /** Person id or `rama:<component>@<version>`. */
  createdBy: string;
}

/** A decision card: one append-only row (audited by trigger) and one line in `.rama/decisions.jsonl`. */
export async function decide(db: Db, site: SiteRef, input: DecideInput): Promise<Decision> {
  const record = await underSiteLock(db, site.id, async (one) => {
    const existing = await listDecisions(one, site.id);
    if (input.supersedes) {
      if (!existing.some((d) => d.id === input.supersedes))
        throw new Error(`decision ${input.supersedes} does not exist`);
      if (existing.some((d) => d.supersedes === input.supersedes))
        throw new Error(`decision ${input.supersedes} is already superseded`);
    }
    const [row] = await one
      .insert(decisions)
      .values({
        siteId: site.id,
        sessionId: input.sessionId ?? null,
        title: input.title,
        statement: input.statement,
        bricks: input.bricks,
        screenId: input.screenId ?? null,
        status: input.status,
        by: input.by,
        at: input.at,
        reconstructed: Boolean(input.reconstructed),
        supersedes: input.supersedes ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    return toDecision(row!);
  });
  await publish(db, site, DECISIONS_FILE, (tx) => listDecisions(tx, site.id), record);
  return record;
}

export interface SessionWithTurns {
  id: string;
  title: string;
  reconstructed: boolean;
  source: string | null;
  createdAt: string;
  turns: { id: string; seq: number; speaker: string; text: string; draft: boolean; at: string }[];
}

export async function startSession(
  db: Db,
  siteId: string,
  input: { title: string; reconstructed?: boolean; source?: string; createdBy: string },
): Promise<string> {
  const [row] = await db
    .insert(discoverySessions)
    .values({
      siteId,
      title: input.title,
      reconstructed: Boolean(input.reconstructed),
      source: input.source ?? null,
      createdBy: input.createdBy,
    })
    .returning({ id: discoverySessions.id });
  return row!.id;
}

export async function addTurn(
  db: Db,
  siteId: string,
  sessionId: string,
  input: { speaker: string; text: string; draft?: boolean; at: Date; createdBy: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const turns = await tx
      .select({ seq: discoveryTurns.seq })
      .from(discoveryTurns)
      .where(eq(discoveryTurns.sessionId, sessionId));
    await tx.insert(discoveryTurns).values({
      siteId,
      sessionId,
      seq: turns.reduce((m, t) => Math.max(m, t.seq), 0) + 1,
      speaker: input.speaker,
      text: input.text,
      draft: Boolean(input.draft),
      at: input.at,
      createdBy: input.createdBy,
    });
  });
}

export async function listSessions(db: Db, siteId: string): Promise<SessionWithTurns[]> {
  const sessions = await db
    .select()
    .from(discoverySessions)
    .where(eq(discoverySessions.siteId, siteId))
    .orderBy(asc(discoverySessions.createdAt));
  const turns = await db
    .select()
    .from(discoveryTurns)
    .where(eq(discoveryTurns.siteId, siteId))
    .orderBy(asc(discoveryTurns.seq));
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    reconstructed: s.reconstructed,
    source: s.source,
    createdAt: s.createdAt.toISOString(),
    turns: turns
      .filter((t) => t.sessionId === s.id)
      .map((t) => ({
        id: t.id,
        seq: t.seq,
        speaker: t.speaker,
        text: t.text,
        draft: t.draft,
        at: t.at.toISOString(),
      })),
  }));
}
