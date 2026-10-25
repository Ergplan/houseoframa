// The audit replay as plain state: two drones fly over the site, beam over one file at a time, and leave
// its verdict as a badge; the auditor's narration enters the log as it is reached. `stepAudit` is a pure
// function of the run and the time passed, so the replay is tested without a browser. The Brick level
// flies it brick by brick; the Street flies it building by building (streetAuditScript). Ported from the
// weekend prototype's updateAudit (reference/weekend-prototype/audit.js); moved here from
// apps/rama/canvas/audit.ts in Stage 8.
import type { AuditStep, AuditView, Verdict } from '@rama/audit/view';
import { SCAN_BUDGET } from '@rama/audit/view';
import type { Street } from './street.ts';

/** Where a drone hovers to scan: the top of a box in the picture. */
export interface ScanBox {
  x: number;
  y: number;
  w: number;
}

export interface Drone {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export type LogEntry =
  | { kind: 'phase'; text: string }
  | { kind: 'say'; text: string }
  | { kind: 'finding'; path: string; verdict: Exclude<Verdict, 'pass'>; text: string };

export interface AuditRun {
  steps: AuditStep[];
  /** The step being played, and seconds into it. */
  i: number;
  t: number;
  /** Verdicts revealed so far: the badges on the building. */
  verdicts: Record<string, Verdict>;
  log: LogEntry[];
  drones: [Drone, Drone];
  /** The brick under a beam, and which drone holds it. */
  scan: { path: string; drone: 0 | 1 } | null;
  done: boolean;
}

export function startAudit(steps: AuditStep[], top: number, width: number): AuditRun {
  return {
    steps,
    i: 0,
    t: 0,
    verdicts: {},
    log: [],
    drones: [
      { x: -40, y: 120, tx: width * 0.25, ty: top - 120 },
      { x: width + 40, y: 140, tx: width * 0.75, ty: top - 120 },
    ],
    scan: null,
    done: false,
  };
}

/** Advances the run by `dt` seconds. Returns a new run; the one given is not changed. */
export function stepAudit(
  run: AuditRun,
  dt: number,
  boxOf: (path: string) => ScanBox | undefined,
): AuditRun {
  if (run.done) return run;
  const next: AuditRun = {
    ...run,
    verdicts: { ...run.verdicts },
    log: [...run.log],
    drones: [{ ...run.drones[0] }, { ...run.drones[1] }],
  };
  let left = dt;
  while (left > 0 && !next.done) {
    const st = next.steps[next.i];
    if (!st) {
      next.done = true;
      break;
    }
    if (next.t === 0) {
      // The step begins.
      if (st.kind === 'phase') next.log.push({ kind: 'phase', text: st.text });
      if (st.kind === 'say') next.log.push({ kind: 'say', text: st.text });
      if (st.kind === 'report') {
        next.done = true;
        next.scan = null;
        break;
      }
      if (st.kind === 'scan') {
        const box = boxOf(st.path);
        const drone = (next.i % 2) as 0 | 1;
        next.scan = box ? { path: st.path, drone } : null;
        if (box) {
          next.drones[drone].tx = box.x + box.w / 2;
          next.drones[drone].ty = box.y - 34;
        }
      }
    }
    const step = Math.min(left, st.seconds - next.t);
    const before = next.t;
    next.t += step;
    left -= step;
    // Half way through a scan, the verdict is revealed and stays.
    if (st.kind === 'scan' && before < st.seconds / 2 && next.t >= st.seconds / 2) {
      next.verdicts[st.path] = st.verdict;
      if (st.verdict !== 'pass')
        next.log.push({ kind: 'finding', path: st.path, verdict: st.verdict, text: st.note });
    }
    if (next.t >= st.seconds) {
      next.i += 1;
      next.t = 0;
      if (st.kind === 'scan') next.scan = null;
    }
  }
  const k = Math.min(1, dt * 2.5);
  for (const d of next.drones) {
    d.x += (d.tx - d.x) * k;
    d.y += (d.ty - d.y) * k;
  }
  return next;
}

/** Jumps to the end: every verdict revealed, every line logged. */
export function finishAudit(run: AuditRun, boxOf: (path: string) => ScanBox | undefined): AuditRun {
  const total = run.steps.reduce((s, x) => s + x.seconds, 0);
  return stepAudit(run, total + 1, boxOf);
}

const RANK: Record<Verdict, number> = { pass: 0, note: 1, defect: 2 };

/** The worst verdict revealed so far on each building's files: the badges that stay on the Street. */
export function buildingVerdicts(
  verdicts: Record<string, Verdict>,
  s: Pick<Street, 'buildings'>,
): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const b of s.buildings) {
    for (const p of b.bricks) {
      const v = verdicts[p];
      if (v && (out[b.id] === undefined || RANK[v] > RANK[out[b.id]!])) out[b.id] = v;
    }
  }
  return out;
}

/**
 * The replay on the Street: discovery, then building by building (its files floor by floor), then the
 * screens and the verdict. Each scan's note is the building's name and the verdict in words; what each
 * check found is read at the code level. A file the audit did not see (laid after it) is not scanned.
 */
export function streetAuditScript(audit: AuditView, s: Pick<Street, 'buildings'>): AuditStep[] {
  const steps: AuditStep[] = [];
  const say = (part: string) => {
    for (const n of audit.narration.filter((x) => x.part === part))
      steps.push({ kind: 'say', text: n.text, seconds: Math.max(2.4, n.text.length / 16) });
  };
  steps.push({ kind: 'phase', text: 'The auditor arrives', seconds: 1.2 });
  say('discovery');
  let unseen = 0;
  for (const b of s.buildings) {
    const files = b.bricks.filter((p) => p in audit.verdicts);
    unseen += b.bricks.length - files.length;
    if (!files.length) continue;
    steps.push({ kind: 'phase', text: b.name, seconds: 1.2 });
    for (const path of files) {
      const verdict = audit.verdicts[path]!;
      steps.push({
        kind: 'scan',
        path,
        verdict,
        note:
          verdict === 'defect'
            ? `${b.name}: a defect`
            : verdict === 'note'
              ? `${b.name}: a note`
              : '',
        seconds: verdict === 'pass' ? 0.25 : verdict === 'note' ? 0.6 : 2.4,
      });
    }
  }
  if (unseen)
    steps.push({
      kind: 'phase',
      text: `${unseen} file${unseen === 1 ? ' is' : 's are'} newer than this audit and ${unseen === 1 ? 'was' : 'were'} not audited`,
      seconds: 2,
    });
  steps.push({ kind: 'phase', text: 'Screens and signatures', seconds: 1.2 });
  say('screens');
  steps.push({ kind: 'phase', text: 'Verdict', seconds: 1.2 });
  say('verdict');
  steps.push({ kind: 'report', seconds: 1 });
  const scanning = steps.reduce((t, x) => t + (x.kind === 'scan' ? x.seconds : 0), 0);
  if (scanning > SCAN_BUDGET) {
    const k = SCAN_BUDGET / scanning;
    for (const x of steps) if (x.kind === 'scan') x.seconds *= k;
  }
  return steps;
}
