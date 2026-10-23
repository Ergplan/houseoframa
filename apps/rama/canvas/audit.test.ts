import { describe, expect, it } from 'vitest';
import type { AuditStep } from '@rama/audit/view';
import { finishAudit, startAudit, stepAudit } from './audit';
import type { BrickBox } from './layout';

const box = (path: string, x: number): BrickBox => ({ path, x, y: 300, w: 40, h: 12 }) as BrickBox;
const boxes = new Map([
  ['lib/a.ts', box('lib/a.ts', 100)],
  ['lib/b.ts', box('lib/b.ts', 200)],
]);
const boxOf = (p: string) => boxes.get(p);
const steps: AuditStep[] = [
  { kind: 'phase', text: 'Logic floor', seconds: 1 },
  { kind: 'scan', path: 'lib/a.ts', verdict: 'pass', note: 'clean', seconds: 1 },
  { kind: 'scan', path: 'lib/b.ts', verdict: 'defect', note: 'Takes item 2.', seconds: 2 },
  { kind: 'say', text: 'One defect.', seconds: 2 },
  { kind: 'report', seconds: 1 },
];

describe('the audit replay', () => {
  it('logs the phase, sends a drone over each brick and reveals its verdict half way through the scan', () => {
    let run = startAudit(steps, 260, 900);
    run = stepAudit(run, 0.5, boxOf);
    expect(run.log).toEqual([{ kind: 'phase', text: 'Logic floor' }]);
    run = stepAudit(run, 0.6, boxOf);
    expect(run.scan).toEqual({ path: 'lib/a.ts', drone: 1 });
    expect(run.drones[1]).toMatchObject({ tx: 120, ty: 266 });
    expect(run.verdicts).toEqual({});
    run = stepAudit(run, 0.5, boxOf);
    expect(run.verdicts).toEqual({ 'lib/a.ts': 'pass' });
    // A pass is a badge, not a log line; a defect is both.
    run = stepAudit(run, 1.5, boxOf);
    expect(run.verdicts['lib/b.ts']).toBe('defect');
    expect(run.log.at(-1)).toEqual({
      kind: 'finding',
      path: 'lib/b.ts',
      verdict: 'defect',
      text: 'Takes item 2.',
    });
  });

  it('ends on the report with every verdict revealed and every line logged, and does not change the run it was given', () => {
    const start = startAudit(steps, 260, 900);
    const done = finishAudit(start, boxOf);
    expect(done.done).toBe(true);
    expect(done.verdicts).toEqual({ 'lib/a.ts': 'pass', 'lib/b.ts': 'defect' });
    expect(done.log.map((l) => l.kind)).toEqual(['phase', 'finding', 'say']);
    expect(start.log).toEqual([]);
    expect(stepAudit(done, 5, boxOf)).toBe(done);
  });

  it('skips the beam for a brick that is not on the building, and still reveals its verdict', () => {
    const run = finishAudit(
      startAudit(
        [{ kind: 'scan', path: 'gone.ts', verdict: 'note', note: 'n', seconds: 1 }],
        260,
        900,
      ),
      boxOf,
    );
    expect(run.verdicts).toEqual({ 'gone.ts': 'note' });
  });
});
