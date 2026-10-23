// The second opinion: the auditor model (prompt audit.v1, role auditor, so AUDITOR_VENDOR, never the
// builder's vendor) reads the check results and a summary of the Blueprint and writes the narration, the
// alterations with estimates, and the time machine. It may explain a finding or downgrade it (defect to
// note, note to pass), with a reason; it cannot add a finding or raise a verdict. Its reply has no field
// for a new finding, and every change it asks for is checked against the findings it was given.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import { canonicalJson } from '@rama/blueprint/json';
import { auditCounts, auditFloorCounts, authors } from '@rama/blueprint/metrics';
import { call as modelCall } from '@rama/model';
import { signaturesInForce } from '@rama/ceremony/records';
import {
  lower,
  type CheckFinding,
  type CheckResults,
  type CheckRun,
  type Verdict,
} from './findings.ts';

export const AUDIT_COMPONENT = 'rama:audit@0.1.0';
/** Notes sent in full per check; the rest are counted. Every defect is sent in full. */
const NOTES_PER_CHECK = 12;

export interface NumberedFinding extends CheckFinding {
  /** F1, F2, …: the order of the sorted check results. */
  id: string;
}

export interface AuditorInput {
  site: string;
  commit: string;
  floors: { id: string; label: string; bricks: number; defects: number; notes: number }[];
  runs: CheckRun[];
  defects: NumberedFinding[];
  notes: NumberedFinding[];
  notesByCheck: Record<string, number>;
  screens: { route: string; signedBy: string | null; signedAt: string | null }[];
  decisions: { title: string; status: string; reconstructed: boolean }[];
  /** Counted here so the auditor never has to count: what it says about totals comes from these. */
  totals: {
    bricks: number;
    defects: number;
    notes: number;
    screens: number;
    screensSigned: number;
    decisions: { decided: number; open: number; notBuilt: number; reconstructed: number };
  };
  commits: { short: string; at: string; author: string; subject: string; files: number }[];
  builders: string[];
}

export const AuditorReply = z
  .object({
    narration: z
      .array(z.object({ part: z.string().min(1), text: z.string().min(1).max(1200) }).strict())
      .min(1)
      .max(40),
    alterations: z
      .array(
        z
          .object({
            title: z.string().min(1).max(300),
            agentTime: z.string().min(1).max(40),
            humanTime: z.string().min(1).max(60),
            kind: z.enum(['defect', 'note', 'policy', 'hygiene']),
            findings: z.array(z.string()).max(200),
          })
          .strict(),
      )
      .max(30),
    timeMachine: z
      .array(
        z
          .object({
            commit: z.string().min(4),
            what: z.string().min(1).max(400),
            shouldHave: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(20),
    verdictChanges: z
      .array(
        z
          .object({
            finding: z.string(),
            to: z.enum(['note', 'pass']),
            why: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type AuditorReply = z.infer<typeof AuditorReply>;

export const number = (fs: CheckFinding[]): NumberedFinding[] =>
  fs.map((f, i) => ({ ...f, id: `F${i + 1}` }));

export function auditorInput(
  site: string,
  bp: Blueprint,
  results: CheckResults,
  people: { signoffs: Signoff[]; decisions: Decision[] },
): AuditorInput {
  const numbered = number(results.findings);
  const notesByCheck: Record<string, number> = {};
  const notes: NumberedFinding[] = [];
  for (const f of numbered.filter((x) => x.verdict === 'note')) {
    notesByCheck[f.check] = (notesByCheck[f.check] ?? 0) + 1;
    if (notesByCheck[f.check]! <= NOTES_PER_CHECK) notes.push(f);
  }
  const inForce = signaturesInForce(people.signoffs);
  const superseded = new Set(people.decisions.map((d) => d.supersedes).filter(Boolean));
  const current = people.decisions.filter((d) => !superseded.has(d.id));
  return {
    site,
    commit: bp.commit,
    floors: auditFloorCounts(bp, numbered),
    runs: results.runs,
    defects: numbered.filter((f) => f.verdict === 'defect'),
    notes,
    notesByCheck,
    screens: bp.screens.map((s) => {
      const sig = inForce.get(`screen:${s.id}`);
      return {
        route: s.route,
        signedBy: sig?.person ?? null,
        signedAt: sig?.target.commit.slice(0, 7) ?? null,
      };
    }),
    decisions: current.map((d) => ({
      title: d.title,
      status: d.status,
      reconstructed: Boolean(d.reconstructed),
    })),
    totals: {
      ...(({ bricks, defects, notes }) => ({ bricks, defects, notes }))(auditCounts(bp, numbered)),
      screens: bp.screens.length,
      screensSigned: bp.screens.filter((s) => inForce.has(`screen:${s.id}`)).length,
      decisions: {
        decided: current.filter((d) => d.status === 'decided').length,
        open: current.filter((d) => d.status === 'open').length,
        notBuilt: current.filter((d) => d.status === 'not-built').length,
        reconstructed: current.filter((d) => d.reconstructed).length,
      },
    },
    commits: bp.commits.slice(-60).map((c) => ({
      short: c.short,
      at: c.at,
      author: c.author,
      subject: c.subject,
      files: c.changes.length,
    })),
    builders: authors(bp),
  };
}

/** sha256 of the canonical JSON the auditor receives: the same inputs always give the same hash. */
export const inputsHash = (input: AuditorInput) =>
  createHash('sha256').update(canonicalJson(input)).digest('hex');

export class AuditorOverreachError extends Error {
  override name = 'AuditorOverreachError';
}

export interface AppliedFinding extends NumberedFinding {
  checkVerdict: Exclude<Verdict, 'pass'>;
  finalVerdict: Verdict;
  auditorNote?: string;
}

/**
 * Applies the auditor's reply to the check findings. Refuses (throws) a reply that names a finding it
 * was not given, raises a verdict, or cites a commit that is not in the history: the auditor explains and
 * downgrades, it does not invent.
 */
export function applyReply(
  findings: NumberedFinding[],
  reply: AuditorReply,
  bp: Blueprint,
): AppliedFinding[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const changes = new Map<string, AuditorReply['verdictChanges'][number]>();
  for (const c of reply.verdictChanges) {
    const f = byId.get(c.finding);
    if (!f)
      throw new AuditorOverreachError(
        `the auditor changed ${c.finding}, a finding the checks did not make`,
      );
    if (!lower(c.to, f.verdict))
      throw new AuditorOverreachError(
        `the auditor raised ${c.finding} from ${f.verdict} to ${c.to}`,
      );
    if (changes.has(c.finding))
      throw new AuditorOverreachError(`the auditor changed ${c.finding} twice`);
    changes.set(c.finding, c);
  }
  for (const a of reply.alterations) {
    for (const id of a.findings)
      if (!byId.has(id))
        throw new AuditorOverreachError(
          `the alteration "${a.title}" cites ${id}, a finding the checks did not make`,
        );
  }
  for (const t of reply.timeMachine) {
    if (!bp.commits.some((c) => c.sha.startsWith(t.commit) || c.short === t.commit)) {
      throw new AuditorOverreachError(
        `the time machine cites commit ${t.commit}, which is not in the history`,
      );
    }
  }
  return findings.map((f) => {
    const c = changes.get(f.id);
    return {
      ...f,
      checkVerdict: f.verdict,
      finalVerdict: c ? c.to : f.verdict,
      ...(c ? { auditorNote: c.why } : {}),
    };
  });
}

export interface AuditorRun {
  reply: AuditorReply;
  applied: AppliedFinding[];
  callId: string;
  vendor: string;
  model: string;
  inputsHash: string;
}

/**
 * Asks the auditor. Every finding is sent with an id, but only the defects and a sample of notes in full;
 * a change to a note it was not shown is still checked against the full list.
 */
export async function askAuditor(
  input: AuditorInput,
  all: NumberedFinding[],
  bp: Blueprint,
  opts: { siteId: string; call?: typeof modelCall },
): Promise<AuditorRun> {
  const call = opts.call ?? modelCall;
  const res = await call({
    name: 'audit',
    version: 1,
    input,
    output: AuditorReply,
    role: 'auditor',
    siteId: opts.siteId,
    createdBy: AUDIT_COMPONENT,
    maxTokens: 32_000,
  });
  return {
    reply: res.output,
    applied: applyReply(all, res.output, bp),
    callId: res.callId,
    vendor: res.vendor,
    model: res.model,
    inputsHash: inputsHash(input),
  };
}
