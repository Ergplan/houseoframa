// One audit of a site: the checks, the auditor's reading, and the signed report, written to `audits`
// and `findings` (append-only; every insert audited by trigger). The report is signed by the auditor's
// vendor and model through its model_calls row, and carries the sha256 of exactly what it was given, so
// anyone can recompute it from that row.
import { asc, desc, eq } from 'drizzle-orm';
import type { Blueprint, Signoff } from '@rama/shared';
import { audits, findings, modelCalls, type Db } from '@rama/db';
import { signaturesInForce } from '@rama/ceremony/records';
import { listDecisions, listSignoffs } from '@rama/ceremony';
import {
  AUDIT_COMPONENT,
  askAuditor,
  auditorInput,
  inputsHash,
  number,
  type AppliedFinding,
  type AuditorInput,
  type AuditorReply,
} from './auditor.ts';
import { auditChecks } from './checks/index.ts';
import type { RunOptions } from './checks/run.ts';
import type { CheckRun, Verdict } from './findings.ts';

export interface SignedReport {
  reportId: string;
  vendor: string;
  model: string;
  at: string;
  inputsHash: string;
  callId: string;
}

export interface SignoffVerdict {
  screen: string;
  person: string;
  commit: string;
  /** Confirmed when no brick of the screen carries a defect at this audit; rejected otherwise, with them. */
  confirmed: boolean;
  defects: string[];
}

export interface AuditReportBody {
  runs: CheckRun[];
  counts: { defects: number; notes: number; passes: number; bricks: number };
  narration: AuditorReply['narration'];
  alterations: AuditorReply['alterations'];
  timeMachine: AuditorReply['timeMachine'];
  verdictChanges: AuditorReply['verdictChanges'];
  signoffs: SignoffVerdict[];
  builders: string[];
}

/** Sign-offs confirmed or rejected by the findings: plain code, not the auditor's opinion. */
export function signoffVerdicts(
  bp: Blueprint,
  signoffs: Signoff[],
  applied: { brick: string; finalVerdict: Verdict }[],
): SignoffVerdict[] {
  const defects = new Set(applied.filter((f) => f.finalVerdict === 'defect').map((f) => f.brick));
  return [...signaturesInForce(signoffs).values()]
    .filter((s) => s.target.kind === 'screen')
    .map((s) => {
      const bricks = bp.screens.find((x) => x.id === s.target.id)?.bricks ?? [];
      const bad = bricks.filter((b) => defects.has(b));
      return {
        screen: s.target.id,
        person: s.person,
        commit: s.target.commit,
        confirmed: bad.length === 0,
        defects: bad,
      };
    });
}

export function reportBody(
  bp: Blueprint,
  runs: CheckRun[],
  applied: AppliedFinding[],
  reply: AuditorReply,
  signoffs: Signoff[],
  builders: string[],
): AuditReportBody {
  const flagged = new Set(applied.filter((f) => f.finalVerdict !== 'pass').map((f) => f.brick));
  return {
    runs,
    counts: {
      defects: applied.filter((f) => f.finalVerdict === 'defect').length,
      notes: applied.filter((f) => f.finalVerdict === 'note').length,
      passes: bp.nodes.filter((n) => !flagged.has(n.path)).length,
      bricks: bp.nodes.length,
    },
    narration: reply.narration,
    alterations: reply.alterations,
    timeMachine: reply.timeMachine,
    verdictChanges: reply.verdictChanges,
    signoffs: signoffVerdicts(bp, signoffs, applied),
    builders,
  };
}

export interface RunAuditOptions {
  siteId: string;
  name: string;
  repoDir: string;
  bp: Blueprint;
  formulaFiles: string[];
  run?: RunOptions | false;
  call?: Parameters<typeof askAuditor>[3]['call'];
  now?: () => Date;
}

export async function runAudit(
  db: Db,
  opts: RunAuditOptions,
): Promise<{ report: SignedReport; body: AuditReportBody }> {
  const [signoffs, decisions] = await Promise.all([
    listSignoffs(db, opts.siteId),
    listDecisions(db, opts.siteId),
  ]);
  const results = auditChecks({
    repoDir: opts.repoDir,
    bp: opts.bp,
    signoffs,
    decisions,
    formulaFiles: opts.formulaFiles,
    run: opts.run,
  });
  const input = auditorInput(opts.name, opts.bp, results, { signoffs, decisions });
  const all = number(results.findings);
  const auditor = await askAuditor(input, all, opts.bp, {
    siteId: opts.siteId,
    ...(opts.call ? { call: opts.call } : {}),
  });
  const body = reportBody(
    opts.bp,
    results.runs,
    auditor.applied,
    auditor.reply,
    signoffs,
    input.builders,
  );
  const at = (opts.now ?? (() => new Date()))();
  const auditId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(audits)
      .values({
        siteId: opts.siteId,
        commit: opts.bp.commit,
        vendor: auditor.vendor,
        model: auditor.model,
        callId: auditor.callId,
        inputsHash: auditor.inputsHash,
        at,
        report: body as unknown as Record<string, unknown>,
        createdBy: AUDIT_COMPONENT,
      })
      .returning({ id: audits.id });
    const flagged = new Set(auditor.applied.map((f) => f.brick));
    const rows = [
      ...auditor.applied.map((f) => ({
        siteId: opts.siteId,
        auditId: row!.id,
        brick: f.brick,
        check: f.check,
        verdict: f.finalVerdict,
        checkVerdict: f.checkVerdict,
        text: f.text,
        file: f.file ?? null,
        line: f.line ?? null,
        auditorNote: f.auditorNote ?? null,
        createdBy: AUDIT_COMPONENT,
      })),
      // A pass row for every brick no check found anything on: its verdict is on file too.
      ...opts.bp.nodes
        .filter((n) => !flagged.has(n.path))
        .map((n) => ({
          siteId: opts.siteId,
          auditId: row!.id,
          brick: n.path,
          check: 'all',
          verdict: 'pass' as const,
          checkVerdict: 'pass' as const,
          text: 'No check that ran found anything here.',
          file: null,
          line: null,
          auditorNote: null,
          createdBy: AUDIT_COMPONENT,
        })),
    ];
    for (let i = 0; i < rows.length; i += 500)
      await tx.insert(findings).values(rows.slice(i, i + 500));
    return row!.id;
  });
  return {
    report: {
      reportId: auditId,
      vendor: auditor.vendor,
      model: auditor.model,
      at: at.toISOString(),
      inputsHash: auditor.inputsHash,
      callId: auditor.callId,
    },
    body,
  };
}

export interface StoredAudit {
  report: SignedReport;
  commit: string;
  body: AuditReportBody;
  findings: {
    brick: string;
    check: string;
    verdict: Verdict;
    checkVerdict: Verdict;
    text: string;
    file: string | null;
    line: number | null;
    auditorNote: string | null;
  }[];
}

export async function latestAudit(db: Db, siteId: string): Promise<StoredAudit | null> {
  const [a] = await db
    .select()
    .from(audits)
    .where(eq(audits.siteId, siteId))
    .orderBy(desc(audits.at))
    .limit(1);
  if (!a) return null;
  const fs = await db
    .select()
    .from(findings)
    .where(eq(findings.auditId, a.id))
    .orderBy(asc(findings.brick), asc(findings.line));
  return {
    report: {
      reportId: a.id,
      vendor: a.vendor,
      model: a.model,
      at: a.at.toISOString(),
      inputsHash: a.inputsHash,
      callId: a.callId,
    },
    commit: a.commit,
    body: a.report as unknown as AuditReportBody,
    findings: fs.map((f) => ({
      brick: f.brick,
      check: f.check,
      verdict: f.verdict,
      checkVerdict: f.checkVerdict,
      text: f.text,
      file: f.file,
      line: f.line,
      auditorNote: f.auditorNote,
    })),
  };
}

/**
 * Recomputes the report's hash from what the auditor actually received (its model_calls row) and checks
 * the row was made by the vendor and model the report names.
 */
export async function verifyReport(
  db: Db,
  report: SignedReport,
): Promise<{ ok: boolean; why?: string }> {
  const [c] = await db.select().from(modelCalls).where(eq(modelCalls.id, report.callId));
  if (!c) return { ok: false, why: 'the model call the report names does not exist' };
  if (c.role !== 'auditor') return { ok: false, why: `the call was made in the ${c.role} role` };
  if (c.vendor !== report.vendor || c.model !== report.model)
    return { ok: false, why: 'the call was made by another vendor or model' };
  const hash = inputsHash(c.input as unknown as AuditorInput);
  return hash === report.inputsHash
    ? { ok: true }
    : { ok: false, why: 'what the auditor received does not hash to the report' };
}
