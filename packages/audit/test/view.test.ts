import { describe, expect, it } from 'vitest';
import type { Blueprint } from '@rama/shared';
import { auditScript, SCAN_BUDGET, toAuditView, type AuditView } from '../src/view.ts';

const bp = (n: number) =>
  ({
    layers: [{ id: 'logic', label: 'Logic — rules' }],
    nodes: Array.from({ length: n }, (_, i) => ({ path: `lib/${i}.ts`, layer: 'logic' })),
  }) as unknown as Blueprint;
const view = (verdicts: AuditView['verdicts'], findings: AuditView['findings'] = []): AuditView =>
  ({
    narration: [
      { part: 'discovery', text: 'No decisions.' },
      { part: 'logic', text: 'One defect.' },
      { part: 'verdict', text: 'Unsigned.' },
      { part: 'extra', text: 'An observation.' },
    ],
    verdicts,
    findings,
  }) as AuditView;

describe('auditScript', () => {
  it('flies discovery, each floor with its narration and bricks, the screens, the verdict, then the report', () => {
    const steps = auditScript(
      view({ 'lib/0.ts': 'defect', 'lib/1.ts': 'pass' }, [
        {
          brick: 'lib/0.ts',
          check: 'positional-assumption',
          verdict: 'defect',
          checkVerdict: 'defect',
          text: 'Takes item 2.',
          file: null,
          line: 3,
          auditorNote: null,
        },
      ]),
      bp(2),
      () => ['lib/0.ts', 'lib/1.ts'],
    );
    expect(
      steps.map((s) =>
        s.kind === 'scan'
          ? `scan ${s.path} ${s.verdict}`
          : s.kind === 'report'
            ? 'report'
            : `${s.kind} ${s.text}`,
      ),
    ).toEqual([
      'phase Audit requested',
      'phase Discovery',
      'say No decisions.',
      'phase Logic floor',
      'say One defect.',
      'scan lib/0.ts defect',
      'scan lib/1.ts pass',
      'phase Screens and sign-offs',
      'phase Verdict',
      'say Unsigned.',
      'say An observation.',
      'report',
    ]);
    expect(steps.find((s) => s.kind === 'scan')).toMatchObject({
      note: 'Takes item 2.',
      seconds: 2.4,
    });
  });

  it('keeps a large site within the scan budget at 1×, defects still the longest', () => {
    const paths = Array.from({ length: 2000 }, (_, i) => `lib/${i}.ts`);
    const steps = auditScript(view({ 'lib/0.ts': 'defect' }), bp(2000), () => paths);
    const scans = steps.filter((s) => s.kind === 'scan');
    expect(scans.reduce((t, s) => t + s.seconds, 0)).toBeCloseTo(SCAN_BUDGET, 6);
    expect(scans[0]!.seconds).toBeGreaterThan(scans[1]!.seconds);
  });
});

describe('toAuditView', () => {
  it("gives each brick its worst verdict across the audit's findings", () => {
    const f = (brick: string, verdict: 'pass' | 'note' | 'defect') => ({
      brick,
      check: 'x',
      verdict,
      checkVerdict: verdict,
      text: '',
      file: null,
      line: null,
      auditorNote: null,
    });
    const v = toAuditView({
      report: {} as AuditView['report'],
      commit: 'c',
      body: {
        counts: { defects: 1, notes: 1, passes: 1, bricks: 2 },
        runs: [],
        narration: [],
        alterations: [],
        timeMachine: [],
        signoffs: [],
        builders: [],
      },
      findings: [f('a', 'note'), f('a', 'defect'), f('a', 'note'), f('b', 'pass')],
    });
    expect(v.verdicts).toEqual({ a: 'defect', b: 'pass' });
  });
});
