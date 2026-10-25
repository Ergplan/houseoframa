import { describe, expect, it } from 'vitest';
import type { Blueprint, BrickNode, Commit, ImportEdge } from '@rama/shared';
import * as m from './index.ts';

const node = (path: string, over: Partial<BrickNode> = {}): BrickNode => ({
  path,
  layer: 'logic',
  layerRule: 'test',
  lines: 10,
  bytes: 100,
  binary: false,
  test: false,
  exports: [],
  env: [],
  envDynamic: false,
  firstCommit: '',
  lastCommit: '',
  changes: 1,
  ...over,
});
const edge = (from: string, to: string, symbols = ['x']): ImportEdge => ({ from, to, symbols, typeOnly: false });
const commit = (sha: string, author: string, changes: Commit['changes']): Commit => ({
  sha,
  short: sha.slice(0, 7),
  at: '2026-01-01T00:00:00Z',
  author,
  subject: sha,
  changes,
});

const bp: Blueprint = {
  repo: 'fixture',
  commit: 'c3',
  worktree: false,
  extractedAt: '',
  extractorVersion: 'test',
  layers: [],
  nodes: [
    node('lib/a.ts', { lines: 120, env: ['B', 'A'], changes: 3 }),
    node('lib/b.ts', { lines: 30, env: ['A'], changes: 1 }),
    node('lib/a.test.ts', { test: true, lines: 40, changes: 2 }),
    node('app/globals.css', { lines: 500, changes: 3 }),
    node('public/logo.png', { binary: true, lines: 0, changes: 1 }),
  ],
  edges: [
    edge('lib/b.ts', 'lib/a.ts'),
    edge('lib/a.test.ts', 'lib/a.ts'),
    edge('app/globals.css', 'lib/b.ts', []),
  ],
  unresolved: [],
  tables: [],
  external: [],
  commits: [
    commit('c1aaaaaa', 'Asha', [{ path: 'lib/a.ts', kind: 'A', add: 100, del: 0 }]),
    commit('c2bbbbbb', 'Ravi', [{ path: 'lib/a.ts', kind: 'M', add: 5, del: 25 }]),
    commit('c3cccccc', 'Asha', [{ path: 'lib/a.ts', kind: 'M', add: 1, del: 19 }, { path: 'public/logo.png', kind: 'A', add: null, del: null }]),
  ],
  branches: ['main', 'feature'],
  tags: [],
  screens: [],
};

describe('metrics (one function per figure)', () => {
  it('files counts every brick', () => expect(m.files(bp)).toBe(5));
  it('textLines sums text bricks only', () => expect(m.textLines(bp)).toBe(690));
  it('tests counts test bricks', () => expect(m.tests(bp)).toBe(1));
  it('commits counts the history', () => expect(m.commits(bp)).toBe(3));
  it('authors lists distinct names', () => expect(m.authors(bp)).toEqual(['Asha', 'Ravi']));
  it('branches counts branches', () => expect(m.branches(bp)).toBe(2));
  it('importEdges counts edges that import names', () => expect(m.importEdges(bp)).toBe(2));
  it('sideEffectImports counts edges with no names', () => expect(m.sideEffectImports(bp)).toBe(1));
  it('envVars lists distinct names', () => expect(m.envVars(bp)).toEqual(['A', 'B']));
  it('loadBearing ranks by importers, ties by path', () =>
    expect(m.loadBearing(bp, 2)).toEqual([
      { path: 'lib/a.ts', count: 2 },
      { path: 'lib/b.ts', count: 1 },
    ]));
  it('mostReworked ranks by changes, ties by path', () =>
    expect(m.mostReworked(bp, 2)).toEqual([
      { path: 'app/globals.css', count: 3 },
      { path: 'lib/a.ts', count: 3 },
    ]));
  it('heaviestCodeBrick ignores stylesheets', () => expect(m.heaviestCodeBrick(bp)?.path).toBe('lib/a.ts'));
  it('demolitions finds changes deleting at least 20 lines, by 1-based commit', () =>
    expect(m.demolitions(bp)).toEqual([{ commit: 2, sha: 'c2bbbbbb', path: 'lib/a.ts', deleted: 25 }]));
  it('brickFigures gives each brick its dependencies and dependants, and no test signal (Invariant 11)', () => {
    const f = m.brickFigures(bp);
    expect(f['lib/a.ts']).toEqual({ dependsOn: 0, usedBy: 2 });
    expect(f['lib/b.ts']).toEqual({ dependsOn: 1, usedBy: 1 });
    expect(f['lib/a.test.ts']).toEqual({ dependsOn: 1, usedBy: 0 });
    expect(f['app/globals.css']).toEqual({ dependsOn: 1, usedBy: 0 });
    expect(Object.keys(f)).toHaveLength(5);
  });
  it('historySpan is the time from the first to the last commit, in minutes', () => {
    const later = { ...bp, commits: [bp.commits[0]!, { ...bp.commits[2]!, at: '2026-01-01T06:30:00+05:30' }] };
    expect(m.historySpan(later)).toBe(60);
    expect(m.historySpan({ ...bp, commits: [] })).toBe(0);
  });
  it('commitTotals sums added and deleted lines and counts the test bricks a commit laid', () => {
    expect(m.commitTotals(bp, bp.commits[2]!)).toEqual({ add: 1, del: 19, testsAdded: 0 });
    const withTest = { ...bp.commits[0]!, changes: [{ path: 'lib/a.test.ts', kind: 'A' as const, add: 40, del: 0 }] };
    expect(m.commitTotals(bp, withTest)).toEqual({ add: 40, del: 0, testsAdded: 1 });
  });
  it('commitBreakdown sorts a commit\'s changes into laid, renovated, knocked out and gone', () => {
    const first: Record<string, string> = { 'lib/a.ts': 'c1aaaaaa', 'public/logo.png': 'c3cccccc' };
    const b = { ...bp, nodes: bp.nodes.map((n) => (first[n.path] ? { ...n, firstCommit: first[n.path]! } : n)) };
    expect(m.commitBreakdown(b, b.commits[0]!).laid).toEqual(['lib/a.ts']);
    const second = m.commitBreakdown(b, b.commits[1]!);
    expect(second.knockedOut.map((c) => c.path)).toEqual(['lib/a.ts']);
    expect(second.renovated).toEqual([]);
    const third = m.commitBreakdown(b, { ...b.commits[2]!, changes: [...b.commits[2]!.changes, { path: 'old.ts', kind: 'D', add: 0, del: 3 }] });
    expect(third.renovated.map((c) => c.path)).toEqual(['lib/a.ts']);
    expect(third.laid).toEqual(['public/logo.png']);
    expect(third.gone.map((c) => c.path)).toEqual(['old.ts']);
  });
  it('brickHistory lists the commits that touched a brick, where it was laid, and its rework', () => {
    const b = { ...bp, nodes: bp.nodes.map((n) => (n.path === 'lib/a.ts' ? { ...n, firstCommit: 'c1aaaaaa' } : n)) };
    const h = m.brickHistory(b, 'lib/a.ts');
    expect(h.entries.map((e) => [e.index, e.short, e.laid, e.add, e.del])).toEqual([
      [0, 'c1aaaaa', true, 100, 0],
      [1, 'c2bbbbb', false, 5, 25],
      [2, 'c3ccccc', false, 1, 19],
    ]);
    expect(h.laidIn).toBe(0);
    expect(h.reworked).toBe(2);
    expect(m.brickHistory(b, 'lib/b.ts')).toEqual({ entries: [], laidIn: null, reworked: 0 });
  });
  it('screensOf lists the screens a brick is behind', () => {
    const b = { ...bp, screens: [{ id: '/', name: 'Home', route: '/', file: 'app/page.tsx', bricks: ['lib/a.ts'] }] };
    expect(m.screensOf(b, 'lib/a.ts').map((s) => s.route)).toEqual(['/']);
    expect(m.screensOf(b, 'lib/b.ts')).toEqual([]);
  });
  it('dependenciesByFloor groups what a brick imports by the floor it stands on, in floor order', () => {
    const b = {
      ...bp,
      layers: [
        { id: 'data', label: 'Data' },
        { id: 'logic', label: 'Logic' },
      ],
      nodes: [...bp.nodes, node('lib/c.ts', { layer: 'data' })],
      edges: [...bp.edges, edge('lib/b.ts', 'lib/c.ts')],
    };
    expect(m.dependenciesByFloor(b, 'lib/b.ts')).toEqual([
      { layer: 'data', paths: ['lib/c.ts'] },
      { layer: 'logic', paths: ['lib/a.ts'] },
    ]);
  });
  it('screensRendering picks the captured screens whose bricks include a brick', () => {
    const shots = [
      { name: 'home', bricks: ['lib/a.ts', 'lib/b.ts'] },
      { name: 'bills', bricks: ['lib/b.ts'] },
    ];
    expect(m.screensRendering(shots, 'lib/b.ts').map((x) => x.name)).toEqual(['home', 'bills']);
    expect(m.screensRendering(shots, 'lib/a.ts').map((x) => x.name)).toEqual(['home']);
    expect(m.screensRendering(shots, 'app/globals.css')).toEqual([]);
  });
  it('signatureCoverage counts the screens signed at the Blueprint commit over all screens', () => {
    const b = {
      ...bp,
      screens: [
        { id: '/', name: 'Home', route: '/', file: 'app/page.tsx', bricks: ['lib/a.ts'] },
        { id: '/b', name: 'B', route: '/b', file: 'app/b/page.tsx', bricks: ['lib/b.ts'] },
      ],
    };
    expect(m.signatureCoverage(b, ['/'])).toEqual({ signed: 1, unsigned: 1, of: 2 });
    expect(m.signatureCoverage(b, ['/', '/nowhere'])).toEqual({ signed: 1, unsigned: 1, of: 2 });
  });
  it('brickMarks: green on the code of a signed screen, nothing else (no test-imports signal)', () => {
    const b = {
      ...bp,
      screens: [
        { id: '/', name: 'Home', route: '/', file: 'app/page.tsx', bricks: ['lib/a.ts', 'lib/b.ts', 'app/globals.css'] },
      ],
    };
    expect(m.brickMarks(b, [])).toEqual({});
    expect(m.brickMarks(b, ['/'])).toEqual({ 'lib/a.ts': 'green', 'lib/b.ts': 'green' });
  });
  it('auditSignoffCounts counts the sign-offs an audit confirmed and rejected', () => {
    expect(m.auditSignoffCounts([{ confirmed: true }, { confirmed: false }, { confirmed: true }])).toEqual({ confirmed: 2, rejected: 1, of: 3 });
    expect(m.auditSignoffCounts([])).toEqual({ confirmed: 0, rejected: 0, of: 0 });
  });
  it('auditCounts and auditFloorCounts total an audit: findings by verdict, and bricks no finding flags', () => {
    const fs = [
      { brick: 'lib/a.ts', verdict: 'defect' as const },
      { brick: 'lib/a.ts', verdict: 'note' as const },
      { brick: 'lib/b.ts', verdict: 'pass' as const },
    ];
    expect(m.auditCounts(bp, fs)).toEqual({ defects: 1, notes: 1, passes: bp.nodes.length - 1, bricks: bp.nodes.length });
    const layered = { ...bp, layers: [{ id: 'logic', label: 'Logic' }], nodes: bp.nodes.map((n) => ({ ...n, layer: 'logic' })) };
    expect(m.auditFloorCounts(layered, fs)).toEqual([{ id: 'logic', label: 'Logic', bricks: 5, defects: 1, notes: 1 }]);
  });
  it('activeBooking and overlaps read a pod timetable', () => {
    const b = (pod: number, startsAt: string, endsAt: string) => ({ pod, siteId: 's', personId: 'p', shift: 'work' as const, startsAt, endsAt });
    const day = [b(1, '2026-10-23T09:00:00Z', '2026-10-23T13:00:00Z'), b(1, '2026-10-23T13:00:00Z', '2026-10-23T17:00:00Z'), b(2, '2026-10-23T09:00:00Z', '2026-10-23T17:00:00Z')];
    expect(m.activeBooking(day, 1, new Date('2026-10-23T12:59:59Z'))).toBe(day[0]);
    expect(m.activeBooking(day, 1, new Date('2026-10-23T13:00:00Z'))).toBe(day[1]);
    expect(m.activeBooking(day, 1, new Date('2026-10-23T17:00:00Z'))).toBeNull();
    expect(m.activeBooking(day, 3, new Date('2026-10-23T12:00:00Z'))).toBeNull();
    expect(m.overlaps(day[0]!, day[1]!)).toBe(false);
    expect(m.overlaps(day[0]!, b(1, '2026-10-23T12:00:00Z', '2026-10-23T14:00:00Z'))).toBe(true);
    expect(m.overlaps(day[0]!, day[2]!)).toBe(false);
  });
  it('podLight: off, pink, blue, amber, green as the site moves from work to signed and audited', () => {
    const b = { ...bp, commit: 'c3', screens: [{ id: '/', name: 'Home', route: '/', file: 'app/page.tsx', bricks: ['lib/a.ts'] }] };
    const work = { shift: 'work' as const, siteId: 's' };
    const light = (over: Partial<Parameters<typeof m.podLight>[0]>) => m.podLight({ booking: work, bp: b, signedScreens: [], capturedCommit: null, audit: null, ...over });
    expect(light({ booking: null })).toBe('off');
    expect(light({ booking: { shift: 'game', siteId: null } })).toBe('pink');
    expect(light({})).toBe('blue');
    expect(light({ capturedCommit: 'c2' })).toBe('blue');
    expect(light({ capturedCommit: 'c3' })).toBe('amber');
    expect(light({ capturedCommit: 'c3', signedScreens: ['/'] })).toBe('blue');
    expect(light({ capturedCommit: 'c3', signedScreens: ['/'], audit: { commit: 'c3', defects: 1 } })).toBe('blue');
    expect(light({ capturedCommit: 'c3', signedScreens: ['/'], audit: { commit: 'c2', defects: 0 } })).toBe('blue');
    expect(light({ capturedCommit: 'c3', signedScreens: ['/'], audit: { commit: 'c3', defects: 0 } })).toBe('green');
  });
  it('handoverReady says what stands between a site and its handover', () => {
    const b = { ...bp, commit: 'c3cccccc', screens: [{ id: '/', name: 'Home', route: '/', file: 'app/page.tsx', bricks: [] }] };
    expect(m.handoverReady({ bp: b, signedScreens: [], audit: null, structureConfirmedAt: null }).reasons).toEqual([
      '1 of 1 screens are not signed at c3ccccc',
      'no audit of c3ccccc',
      'nobody has confirmed the structure',
    ]);
    expect(m.handoverReady({ bp: b, signedScreens: ['/'], audit: { commit: 'c3cccccc', defects: 2 }, structureConfirmedAt: 'x' }).reasons).toEqual(['the audit of c3ccccc found 2 defects']);
    expect(m.handoverReady({ bp: b, signedScreens: ['/'], audit: { commit: 'c3cccccc', defects: 0 }, structureConfirmedAt: 'x' })).toEqual({ ready: true, reasons: [] });
  });
  it('campusFigures: signatures pending by name, audits passed, products in use at 90 days', () => {
    const site = (over: Partial<m.CampusSite>): m.CampusSite => ({ siteId: 's', owner: 'Asha', unsignedScreens: 0, auditPassed: false, handedOverAt: null, checkins: [], ...over });
    const now = new Date('2027-03-01T00:00:00Z');
    const f = m.campusFigures(
      [
        site({ owner: 'Asha', unsignedScreens: 3 }),
        site({ owner: 'Ravi', unsignedScreens: 1 }),
        site({ owner: 'Asha', unsignedScreens: 2, auditPassed: true }),
        // Handed over 120 days ago; in use at 95 days, still in use.
        site({ auditPassed: true, handedOverAt: '2026-11-01T00:00:00Z', checkins: [{ at: '2027-02-04T00:00:00Z', inUse: true }] }),
        // Handed over 120 days ago; in use at 30 days, nothing said at 90.
        site({ handedOverAt: '2026-11-01T00:00:00Z', checkins: [{ at: '2026-12-01T00:00:00Z', inUse: true }] }),
        // Handed over 20 days ago: not yet due.
        site({ handedOverAt: '2027-02-09T00:00:00Z', checkins: [{ at: '2027-02-20T00:00:00Z', inUse: true }] }),
      ],
      now,
    );
    expect(f).toEqual({
      sites: 6,
      signaturesPending: [
        { person: 'Asha', screens: 5 },
        { person: 'Ravi', screens: 1 },
      ],
      auditsPassed: 2,
      inUseAt90: { inUse: 1, of: 2 },
    });
  });
  it('summary reports every figure from the same functions', () =>
    expect(m.summary(bp)).toMatchObject({ files: 5, importEdges: 2, authors: 2, heaviestCodeBrick: 'lib/a.ts' }));
});
