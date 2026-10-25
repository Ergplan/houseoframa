import { describe, expect, it } from 'vitest';
import { stallAudit } from '../test/audit.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import {
  buildingVerdicts,
  finishAudit,
  startAudit,
  stepAudit,
  streetAuditScript,
} from './drones.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { street } from './street.ts';

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)));

describe('the audit on the Street', () => {
  it('flies building by building, in the Street’s order, and leaves out a file the audit did not see', () => {
    const steps = streetAuditScript(stallAudit(), s);
    const phases = steps.filter((x) => x.kind === 'phase').map((x) => (x as { text: string }).text);
    expect(phases).toEqual([
      'The auditor arrives',
      'See today’s orders',
      'Take an order',
      'Shared by several',
      'Behind the screens',
      '1 file is newer than this audit and was not audited',
      'Screens and signatures',
      'Verdict',
    ]);
    const scans = steps.filter((x) => x.kind === 'scan').map((x) => (x as { path: string }).path);
    expect(scans).not.toContain('app/total/page.tsx');
    expect(steps.filter((x) => x.kind === 'say').map((x) => (x as { text: string }).text)).toEqual([
      'A small stall.',
      'One thing to fix before the keys.',
    ]);
  });

  it('leaves a badge on each building: its worst verdict so far', () => {
    expect(buildingVerdicts(stallAudit().verdicts, s)).toEqual({
      'see-orders': 'pass',
      'take-an-order': 'defect',
      shared: 'note',
      behind: 'pass',
    });
    expect(buildingVerdicts({}, s)).toEqual({});
  });

  it('sends the drones over each building in turn and reveals every verdict by the end', () => {
    const steps = streetAuditScript(stallAudit(), s);
    const boxOf = (p: string) => {
      const b = s.buildings.find((x) => x.bricks.includes(p));
      return b ? { x: b.gx * 10, y: 100, w: 20 } : undefined;
    };
    let run = startAudit(steps, 200, 800);
    run = stepAudit(run, 5, boxOf);
    expect(run.scan?.path).toBeDefined();
    run = finishAudit(run, boxOf);
    expect(run.done).toBe(true);
    expect(buildingVerdicts(run.verdicts, s)['take-an-order']).toBe('defect');
  });
});
