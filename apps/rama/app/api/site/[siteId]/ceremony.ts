// The ceremony's write routes, as functions of their dependencies so they are tested without a server.
// Every write is made as the single local member (no auth until Stage 6, rule 11), goes through
// packages/ceremony (append-only rows audited by trigger, mirrored to the target's .rama/), and answers
// 400 for a malformed request, 404 for an unknown site or target, 409 for a stale page or a broken chain,
// and 503 when the database cannot say who is acting.
import { z } from 'zod';
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import type { SiteLocation } from '@rama/blueprint/site';
import type { DecideInput, SignInput, SiteRef } from '@rama/ceremony';
import { signaturesInForce } from '@rama/ceremony/records';

export interface CeremonyDeps {
  locate: (siteId: string) => SiteLocation | null;
  blueprint: (site: SiteLocation) => Blueprint | null;
  /** The commit the site's screens were captured from: what a walkthrough signature names. */
  capturedCommit: (site: SiteLocation) => string | null;
  memberName: string | undefined;
  personId: (name: string) => Promise<string>;
  signoffs: (siteId: string) => Promise<Signoff[]>;
  sign: (site: SiteRef, input: Omit<SignInput, 'sealer'>) => Promise<Signoff>;
  decide: (site: SiteRef, input: DecideInput) => Promise<Decision>;
  startSession: (siteId: string, input: { title: string; createdBy: string }) => Promise<string>;
  addTurn: (
    siteId: string,
    sessionId: string,
    input: { speaker: string; text: string; draft?: boolean; at: Date; createdBy: string },
  ) => Promise<void>;
  sessionTurns: (
    siteId: string,
    sessionId: string,
  ) => Promise<{ speaker: string; text: string }[] | null>;
  decisions: (siteId: string) => Promise<Decision[]>;
  draftQuestion: (
    input: { site: string; turns: { speaker: string; text: string }[]; decisions: Decision[] },
    siteId: string,
  ) => Promise<string>;
  now: () => Date;
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

type Actor = { site: SiteLocation; member: string; personId: string };

async function actor(siteId: string, deps: CeremonyDeps): Promise<Actor | Response> {
  const site = deps.locate(siteId);
  if (!site) return fail(404, `no site "${siteId}"`);
  const member = deps.memberName?.trim();
  if (!member) return fail(409, 'RAMA_MEMBER_NAME is not set: there is no local member to act as');
  try {
    return { site, member, personId: await deps.personId(member) };
  } catch (err) {
    return fail(503, `cannot tell who is acting: ${(err as Error).message}`);
  }
}

const refused = (err: unknown) => {
  const e = err as Error & { record?: unknown };
  // Recorded in Postgres; only the target's mirror line is pending (the next write appends it).
  // No signing key configured: nothing can be signed until one is.
  if (e.name === 'SealError') return fail(503, e.message);
  if (e.name === 'MirrorError')
    return Response.json({ ok: true, record: e.record, warning: e.message });
  if (e.name === 'ChainError' || /already superseded|does not exist/.test(e.message))
    return fail(409, e.message);
  throw err;
};

export const SignBody = z.object({
  screenId: z.string().min(1),
  /** The commit the person was shown: must still be the captured one. */
  commit: z.string().min(7),
  statement: z.string().min(1).max(4000),
  withdraw: z.boolean().optional(),
});

/** A walkthrough confirmation (or withdrawal) on a screen, as the local member. */
export async function handleSign(
  siteId: string,
  raw: unknown,
  deps: CeremonyDeps,
): Promise<Response> {
  const body = SignBody.safeParse(raw);
  if (!body.success) return fail(400, 'expected {screenId, commit, statement, withdraw?}');
  const a = await actor(siteId, deps);
  if (a instanceof Response) return a;
  const bp = deps.blueprint(a.site);
  if (!bp?.screens.some((s) => s.id === body.data.screenId))
    return fail(404, `no screen ${body.data.screenId} in site "${siteId}"`);
  const captured = deps.capturedCommit(a.site);
  if (!captured || captured !== body.data.commit) {
    return fail(
      409,
      'the screens have been captured again since this page was opened; reload and look again',
    );
  }
  const inForce = signaturesInForce(await deps.signoffs(a.site.id)).get(
    `screen:${body.data.screenId}`,
  );
  if (body.data.withdraw && !inForce)
    return fail(409, `${body.data.screenId} has no signature to withdraw`);
  try {
    const s = await deps.sign(
      { id: a.site.id, repoDir: a.site.repoDir },
      {
        person: a.member,
        personId: a.personId,
        target: { kind: 'screen', id: body.data.screenId, commit: captured },
        statement: body.data.statement,
        at: deps.now(),
        // Signing again replaces the signature in force (say, one made at an older commit); a withdrawal ends it.
        ...(inForce ? { supersedes: inForce.id } : {}),
        ...(body.data.withdraw ? { withdrawn: true } : {}),
      },
    );
    return Response.json({ ok: true, signoff: s });
  } catch (err) {
    return refused(err);
  }
}

export const DecideBody = z.object({
  sessionId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  statement: z.string().min(1).max(4000),
  bricks: z.array(z.string().min(1)).max(200).default([]),
  screenId: z.string().min(1).optional(),
  status: z.enum(['decided', 'open', 'not-built']),
  supersedes: z.string().uuid().optional(),
});

/** A decision card, written at the moment the member confirms it. */
export async function handleDecide(
  siteId: string,
  raw: unknown,
  deps: CeremonyDeps,
): Promise<Response> {
  const body = DecideBody.safeParse(raw);
  if (!body.success)
    return fail(
      400,
      'expected {title, statement, status, bricks?, screenId?, sessionId?, supersedes?}',
    );
  const a = await actor(siteId, deps);
  if (a instanceof Response) return a;
  const bp = deps.blueprint(a.site);
  const files = new Set(bp?.nodes.map((n) => n.path));
  const unknown = body.data.bricks.filter((b) => !files.has(b));
  if (unknown.length) return fail(404, `not bricks of this site: ${unknown.join(', ')}`);
  if (body.data.screenId && !bp?.screens.some((s) => s.id === body.data.screenId))
    return fail(404, `no screen ${body.data.screenId}`);
  try {
    const d = await deps.decide(
      { id: a.site.id, repoDir: a.site.repoDir },
      { ...body.data, by: a.member, at: deps.now(), createdBy: a.personId },
    );
    return Response.json({ ok: true, decision: d });
  } catch (err) {
    return refused(err);
  }
}

export async function handleStartSession(
  siteId: string,
  raw: unknown,
  deps: CeremonyDeps,
): Promise<Response> {
  const body = z.object({ title: z.string().min(1).max(200) }).safeParse(raw);
  if (!body.success) return fail(400, 'expected {title}');
  const a = await actor(siteId, deps);
  if (a instanceof Response) return a;
  const id = await deps.startSession(a.site.id, { title: body.data.title, createdBy: a.personId });
  return Response.json({ ok: true, sessionId: id });
}

export async function handleTurn(
  siteId: string,
  raw: unknown,
  deps: CeremonyDeps,
): Promise<Response> {
  const body = z
    .object({
      sessionId: z.string().uuid(),
      text: z.string().min(1).max(4000),
      speaker: z.string().min(1).max(80).optional(),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {sessionId, text, speaker?}');
  const a = await actor(siteId, deps);
  if (a instanceof Response) return a;
  if (!(await deps.sessionTurns(a.site.id, body.data.sessionId)))
    return fail(404, 'no such session');
  await deps.addTurn(a.site.id, body.data.sessionId, {
    speaker: body.data.speaker ?? a.member,
    text: body.data.text,
    at: deps.now(),
    createdBy: a.personId,
  });
  return Response.json({ ok: true });
}

/** Rama's next question, drafted by the builder model and stored as a draft turn (never a decision). */
export async function handleAsk(
  siteId: string,
  raw: unknown,
  deps: CeremonyDeps,
): Promise<Response> {
  const body = z.object({ sessionId: z.string().uuid() }).safeParse(raw);
  if (!body.success) return fail(400, 'expected {sessionId}');
  const a = await actor(siteId, deps);
  if (a instanceof Response) return a;
  const turns = await deps.sessionTurns(a.site.id, body.data.sessionId);
  if (!turns) return fail(404, 'no such session');
  let question: string;
  try {
    question = await deps.draftQuestion(
      { site: a.site.name, turns, decisions: await deps.decisions(a.site.id) },
      a.site.id,
    );
  } catch (err) {
    return fail(502, `Rama could not draft a question: ${(err as Error).message}`);
  }
  await deps.addTurn(a.site.id, body.data.sessionId, {
    speaker: 'Rama',
    text: question,
    draft: true,
    at: deps.now(),
    createdBy: 'rama:ceremony-discovery@0.1.0',
  });
  return Response.json({ ok: true, question });
}
