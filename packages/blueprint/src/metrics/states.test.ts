// The three states and the counting rule (Invariant 11), on the sample product's real history: its
// tests call the figure functions of the orders and total screens, none calls the new-order preview.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Blueprint, Signoff } from '@rama/shared';
import { extract } from '../extract.ts';
import { counts, lastChangeOf, stateOf, stateTally, testReach, type StateInput, type TestRun } from './states.ts';

const MAKE = fileURLToPath(new URL('../../../../scripts/make-sample.mjs', import.meta.url));
let dir: string;
let repo: string;
let bp: Blueprint;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rama-states-'));
  repo = path.join(dir, 'sample');
  execFileSync('node', [MAKE, repo]);
  bp = extract(repo);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const screen = (route: string) => bp.screens.find((s) => s.route === route)!;
const read = (p: string) => readFileSync(path.join(repo, p), 'utf8');
const FIGURES = () => ({
  [screen('/').id]: [
    { fn: 'orderCount', file: 'lib/money.ts' },
    { fn: 'orderAmount', file: 'lib/money.ts' },
  ],
  [screen('/new').id]: [{ fn: 'previewAmount', file: 'lib/preview.ts' }],
  [screen('/total').id]: [
    { fn: 'dayTotal', file: 'lib/money.ts' },
    { fn: 'dayGst', file: 'lib/money.ts' },
  ],
});
const passed = (): TestRun => ({
  commit: bp.commit,
  at: '2026-10-24T10:00:00Z',
  passing: ['lib/money.test.ts', 'lib/orders.test.ts'],
  failing: [],
});
const input = (over: Partial<StateInput> = {}): StateInput => ({
  bp,
  run: passed(),
  reach: testReach(bp, read),
  figures: FIGURES(),
  signatures: new Map(),
  sealed: () => true,
  ...over,
});
const signature = (screenId: string, commit: string, over: Partial<Signoff> = {}): Signoff => ({
  id: 's1',
  siteId: 'sample',
  person: 'Asha Rao',
  target: { kind: 'screen', id: screenId, commit },
  statement: 'I confirm this screen.',
  at: '2026-10-24T10:00:00Z',
  seal: 'x',
  ...over,
});

describe('testReach', () => {
  it('reads which figure functions each test calls', () => {
    const r = testReach(bp, read);
    expect(r['lib/money.test.ts']!.calls).toEqual([
      'lib/money.ts#dayGst',
      'lib/money.ts#dayTotal',
      'lib/money.ts#orderAmount',
    ]);
    expect(r['lib/orders.test.ts']!.calls).toEqual(['db/orders.ts#todaysOrders', 'lib/money.ts#orderCount']);
  });
});

describe('testReach: a render or a visit must happen, not just an import or a path', () => {
  const withTest = (file: string, imports: string[]): Blueprint => ({
    ...bp,
    nodes: [...bp.nodes, { ...bp.nodes[0]!, path: file, test: true }],
    edges: [
      ...bp.edges,
      ...imports.map((to) => ({ from: file, to, symbols: ['default'], typeOnly: false })),
    ],
  });
  const reach = (file: string, src: string, imports: string[] = []) =>
    testReach(withTest(file, imports), (p) => (p === file ? src : read(p)))[file]!;

  it('a page imported and rendered (JSX or called) is a render; imported alone it is not', () => {
    const t = 'app/total/page.test.tsx';
    expect(reach(t, "import Total from './page';\nexpect(Total).toBeDefined();", ['app/total/page.tsx']).renders).toEqual([]);
    expect(reach(t, "import Total from './page';\nrender(<Total />);", ['app/total/page.tsx']).renders).toEqual([
      'app/total/page.tsx',
    ]);
    expect(reach(t, "import Total from './page';\nconst html = Total();", ['app/total/page.tsx']).renders).toEqual([
      'app/total/page.tsx',
    ]);
  });

  it('what a test says in a comment or a string does not count', () => {
    const t = 'app/total/page.test.tsx';
    const imp = "import Total from './page';\n";
    expect(reach(t, imp + '// render(<Total />);', ['app/total/page.tsx']).renders).toEqual([]);
    expect(reach(t, imp + '/* Total() */ const s = "render(<Total />)";', ['app/total/page.tsx']).renders).toEqual(
      [],
    );
    expect(reach(t, "// await page.goto('/total');").routes).toEqual([]);
    expect(reach(t, 'const s = "goto(\'/total\')";').routes).toEqual([]);
    expect(reach('lib/money.test.ts', "import { dayGst } from './money';\n// dayGst(1)").calls).toEqual([]);
  });

  it('a path handed to a visiting call is a visit; a path merely named is not', () => {
    const t = 'e2e/total.test.ts';
    expect(reach(t, "const where = '/total';").routes).toEqual([]);
    expect(reach(t, 'await page.goto(`${base}/total`);').routes).toEqual(['/total']);
    expect(reach(t, "const r = await fetch('/new?as=staff');").routes).toEqual(['/new?as=staff']);
  });
});

describe('stateOf', () => {
  it('Verified: every figure function of the screen is called by a test that passed in the last run', () => {
    const s = stateOf(screen('/total'), input());
    expect(s).toMatchObject({ state: 'Verified', verified: true, confirmed: false });
    expect(s.tests).toEqual(['lib/money.test.ts']);
    expect(stateOf(screen('/'), input()).tests).toEqual(['lib/money.test.ts', 'lib/orders.test.ts']);
  });

  it('Unverified: a figure function no test calls, a failing test, no run, or a run before the change', () => {
    const preview = stateOf(screen('/new'), input());
    expect(preview.state).toBe('Unverified');
    expect(preview.why).toEqual(['No passing test checks previewAmount.']);
    const failing = { ...passed(), passing: ['lib/orders.test.ts'], failing: ['lib/money.test.ts'] };
    expect(stateOf(screen('/total'), input({ run: failing })).state).toBe('Unverified');
    expect(stateOf(screen('/total'), input({ run: null })).why).toEqual(['No test run is on record.']);
    const stale = { ...passed(), commit: bp.commits[0]!.sha };
    expect(stateOf(screen('/total'), input({ run: stale })).why[0]).toMatch(/have not run since/);
  });

  it('a test that only imports a file is not evidence', () => {
    // A test importing the screen's module without calling its figure functions verifies nothing.
    const reach = { 'lib/money.test.ts': { calls: [], renders: [], routes: [] } };
    expect(stateOf(screen('/total'), input({ reach })).state).toBe('Unverified');
  });

  it('a test that renders the page or visits its route verifies it', () => {
    const renders = { 'lib/money.test.ts': { calls: [], renders: [screen('/new').file], routes: [] } };
    expect(stateOf(screen('/new'), input({ reach: renders })).state).toBe('Verified');
    const visits = { 'lib/money.test.ts': { calls: [], renders: [], routes: ['/new?as=staff'] } };
    expect(stateOf(screen('/new'), input({ reach: visits })).state).toBe('Verified');
  });

  it('Confirmed: a sealed signature at or after the last change, and it wins over Verified', () => {
    const id = screen('/total').id;
    const at = lastChangeOf(bp, screen('/total'));
    const signatures = new Map([[`screen:${id}`, signature(id, at)]]);
    const s = stateOf(screen('/total'), input({ signatures }));
    expect(s).toMatchObject({ state: 'Confirmed', verified: true, confirmed: true });
    expect(s.why).toContain('Confirmed: Asha Rao signed it.');
    // Unsealed, withdrawn, or made before the last change: not Confirmed.
    expect(stateOf(screen('/total'), input({ signatures, sealed: () => false })).confirmed).toBe(false);
    const withdrawn = new Map([[`screen:${id}`, signature(id, at, { withdrawn: true })]]);
    expect(stateOf(screen('/total'), input({ signatures: withdrawn })).confirmed).toBe(false);
    const early = new Map([[`screen:${id}`, signature(id, bp.commits[0]!.sha)]]);
    expect(stateOf(screen('/total'), input({ signatures: early })).why).toContain(
      'Asha Rao signed it before its last change.',
    );
  });
});

describe('counts', () => {
  it('names its audience: "N of M customer screens signed"', () => {
    const id = screen('/new').id;
    const signatures = new Map([[`screen:${id}`, signature(id, bp.commit)]]);
    const states = [
      { audience: 'customer' as const, state: stateOf(screen('/'), input({ signatures })) },
      { audience: 'customer' as const, state: stateOf(screen('/new'), input({ signatures })) },
      { audience: 'staff' as const, state: stateOf(screen('/total'), input({ signatures })) },
    ];
    expect(counts(states, 'customer')).toEqual({
      audience: 'customer',
      of: 2,
      signed: 1,
      verified: 1,
      unverified: 0,
      sentence: '1 of 2 customer screens signed',
    });
    expect(counts(states, 'staff').sentence).toBe('0 of 1 staff screen signed');
    expect(counts(states, 'admin').sentence).toBe('0 of 0 admin screens signed');
    expect(stateTally(states.map((s) => s.state))).toEqual({ Verified: 2, Confirmed: 1, Unverified: 0 });
  });
});
