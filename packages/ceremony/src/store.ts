// Writes of the ceremony: discovery sessions and turns, decision cards, signatures. Each is an insert into
// an append-only table (the database refuses UPDATE and DELETE, and audits decisions and signoffs by
// trigger), and decisions and signoffs are mirrored, in the same step, to the target's
// `.rama/decisions.jsonl` and `.rama/signoffs.jsonl` so the record travels with the code. If the
// database does not commit, the mirrored line is taken back.
import { and, asc, eq } from 'drizzle-orm';
import type { Decision, Signoff } from '@rama/shared';
import { decisions, discoverySessions, discoveryTurns, signoffs, type Db } from '@rama/db';
import { appendRecord, checkChain, DECISIONS_FILE, SIGNOFFS_FILE } from './records.ts';

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

export async function listSignoffs(db: Db, siteId: string): Promise<Signoff[]> {
  return (
    await db.select().from(signoffs).where(eq(signoffs.siteId, siteId)).orderBy(asc(signoffs.at))
  ).map(toSignoff);
}

export async function listDecisions(db: Db, siteId: string): Promise<Decision[]> {
  return (
    await db.select().from(decisions).where(eq(decisions.siteId, siteId)).orderBy(asc(decisions.at))
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
}

/** A named signature: one append-only row (audited by trigger) and one line in `.rama/signoffs.jsonl`. */
export async function sign(db: Db, site: SiteRef, input: SignInput): Promise<Signoff> {
  let undo: (() => void) | null = null;
  try {
    return await db.transaction(async (tx) => {
      const existing = (await tx.select().from(signoffs).where(eq(signoffs.siteId, site.id))).map(
        toSignoff,
      );
      checkChain(existing, {
        id: 'pending',
        siteId: site.id,
        person: input.person,
        target: input.target,
        statement: input.statement,
        at: input.at.toISOString(),
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
        ...(input.withdrawn ? { withdrawn: true } : {}),
      });
      const [row] = await tx
        .insert(signoffs)
        .values({
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
      const record = toSignoff(row!);
      undo = appendRecord(site.repoDir, SIGNOFFS_FILE, record);
      return record;
    });
  } catch (err) {
    // The row did not commit: take the mirrored line back, so the file never holds a signature the database does not.
    (undo as (() => void) | null)?.();
    throw err;
  }
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
  let undo: (() => void) | null = null;
  try {
    return await db.transaction(async (tx) => {
      if (input.supersedes) {
        const [prior] = await tx
          .select()
          .from(decisions)
          .where(and(eq(decisions.siteId, site.id), eq(decisions.id, input.supersedes)));
        if (!prior) throw new Error(`decision ${input.supersedes} does not exist`);
        const [taken] = await tx
          .select()
          .from(decisions)
          .where(eq(decisions.supersedes, input.supersedes));
        if (taken) throw new Error(`decision ${input.supersedes} is already superseded`);
      }
      const [row] = await tx
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
      const record = toDecision(row!);
      undo = appendRecord(site.repoDir, DECISIONS_FILE, record);
      return record;
    });
  } catch (err) {
    (undo as (() => void) | null)?.();
    throw err;
  }
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
