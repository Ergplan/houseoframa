// What the app shows of an audit, and the replay the drones fly: plain data, safe for the browser (no
// database, no compiler). Ported from the weekend prototype's auditScript (reference/weekend-prototype/
// audit.js): a phase per part, a scan per brick floor by floor, the auditor's narration spoken between.
import type { Blueprint } from '@rama/shared';

export type Verdict = 'pass' | 'note' | 'defect';

export interface AuditView {
  report: {
    reportId: string;
    vendor: string;
    model: string;
    at: string;
    inputsHash: string;
    callId: string;
  };
  commit: string;
  /** True when the audited code was the working tree on top of `commit`. */
  worktree?: boolean;
  counts: { defects: number; notes: number; passes: number; bricks: number };
  runs: { check: string; ran: boolean; detail: string; outcome?: string }[];
  narration: { part: string; text: string }[];
  alterations: {
    title: string;
    agentTime: string;
    humanTime: string;
    kind: string;
    findings: string[];
  }[];
  timeMachine: { commit: string; what: string; shouldHave: string }[];
  signoffs: {
    screen: string;
    person: string;
    commit: string;
    confirmed: boolean;
    defects: string[];
  }[];
  builders: string[];
  /** Each brick's verdict, and the findings that gave it (pass bricks have none listed). */
  verdicts: Record<string, Verdict>;
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

/** The view of a stored audit (report.ts `latestAudit`), with each brick's verdict from its findings. */
export function toAuditView(stored: {
  report: AuditView['report'];
  commit: string;
  body: Pick<
    AuditView,
    | 'worktree'
    | 'counts'
    | 'runs'
    | 'narration'
    | 'alterations'
    | 'timeMachine'
    | 'signoffs'
    | 'builders'
  >;
  findings: AuditView['findings'];
}): AuditView {
  const rank = { pass: 0, note: 1, defect: 2 } as const;
  const verdicts: Record<string, Verdict> = {};
  for (const f of stored.findings) {
    const was = verdicts[f.brick];
    if (!was || rank[f.verdict] > rank[was]) verdicts[f.brick] = f.verdict;
  }
  const b = stored.body;
  return {
    report: stored.report,
    commit: stored.commit,
    ...(b.worktree ? { worktree: true } : {}),
    counts: b.counts,
    runs: b.runs,
    narration: b.narration,
    alterations: b.alterations,
    timeMachine: b.timeMachine,
    signoffs: b.signoffs,
    builders: b.builders,
    verdicts,
    findings: stored.findings,
  };
}

export type AuditStep =
  | { kind: 'phase'; text: string; seconds: number }
  | { kind: 'say'; text: string; seconds: number }
  | { kind: 'scan'; path: string; verdict: Verdict; note: string; seconds: number }
  | { kind: 'report'; seconds: number };

/** The replay: discovery, each floor (its bricks left to right as the building lays them), screens, verdict. */
export function auditScript(
  audit: AuditView,
  bp: Blueprint,
  order: (layer: string) => string[],
): AuditStep[] {
  const steps: AuditStep[] = [];
  const say = (part: string) => {
    for (const n of audit.narration.filter((x) => x.part === part))
      steps.push({ kind: 'say', text: n.text, seconds: Math.max(2.4, n.text.length / 16) });
  };
  steps.push({ kind: 'phase', text: 'Audit requested', seconds: 1.2 });
  steps.push({ kind: 'phase', text: 'Discovery', seconds: 1.2 });
  say('discovery');
  for (const layer of bp.layers) {
    const bricks = order(layer.id);
    if (!bricks.length) continue;
    steps.push({ kind: 'phase', text: `${layer.label.split(' — ')[0]} floor`, seconds: 1.2 });
    say(layer.id);
    for (const path of bricks) {
      const verdict = audit.verdicts[path] ?? 'pass';
      const first = audit.findings.find((f) => f.brick === path && f.verdict === verdict);
      steps.push({
        kind: 'scan',
        path,
        verdict,
        note: first?.text ?? 'No check that ran found anything here.',
        seconds: verdict === 'pass' ? 0.25 : verdict === 'note' ? 0.6 : 2.4,
      });
    }
  }
  steps.push({ kind: 'phase', text: 'Screens and sign-offs', seconds: 1.2 });
  say('screens');
  steps.push({ kind: 'phase', text: 'Verdict', seconds: 1.2 });
  say('verdict');
  const known = new Set(['discovery', 'screens', 'verdict', ...bp.layers.map((l) => l.id)]);
  for (const n of audit.narration.filter((x) => !known.has(x.part)))
    steps.push({ kind: 'say', text: n.text, seconds: Math.max(2.4, n.text.length / 16) });
  steps.push({ kind: 'report', seconds: 1 });
  // A large site would take minutes to fly: the scans share at most SCAN_BUDGET seconds at 1×, each
  // shortened by the same factor, so a defect still holds the drone longest.
  const scanning = steps.reduce((t, x) => t + (x.kind === 'scan' ? x.seconds : 0), 0);
  if (scanning > SCAN_BUDGET) {
    const k = SCAN_BUDGET / scanning;
    for (const x of steps) if (x.kind === 'scan') x.seconds *= k;
  }
  return steps;
}

/** Seconds of scanning, at 1×, that a replay may take whatever the size of the site. */
export const SCAN_BUDGET = 120;
