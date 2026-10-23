// The audit replay as plain state: two drones fly the floors, beam over one brick at a time, and leave
// its verdict on it as a badge; the auditor's narration enters the log as it is reached. `stepAudit` is a
// pure function of the run and the time passed, so the replay is tested without a browser. Ported from
// the weekend prototype's updateAudit (reference/weekend-prototype/audit.js).
import type { AuditStep, Verdict } from '@rama/audit/view';
import type { BrickBox } from './layout.ts';

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
  boxOf: (path: string) => BrickBox | undefined,
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
export function finishAudit(
  run: AuditRun,
  boxOf: (path: string) => BrickBox | undefined,
): AuditRun {
  const total = run.steps.reduce((s, x) => s + x.seconds, 0);
  return stepAudit(run, total + 1, boxOf);
}
