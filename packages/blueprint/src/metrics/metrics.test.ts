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
  it('untestedBricks lists code bricks no test imports', () => expect(m.untestedBricks(bp)).toEqual(['lib/b.ts']));
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
  it('brickFigures gives each brick its dependencies, dependants and test state', () => {
    const f = m.brickFigures(bp);
    expect(f['lib/a.ts']).toEqual({ dependsOn: 0, usedBy: 2, tested: true });
    expect(f['lib/b.ts']).toEqual({ dependsOn: 1, usedBy: 1, tested: false });
    // A test is not itself tested; a stylesheet or image is not code, so neither applies.
    expect(f['lib/a.test.ts']).toEqual({ dependsOn: 1, usedBy: 0, tested: null });
    expect(f['app/globals.css']).toEqual({ dependsOn: 1, usedBy: 0, tested: null });
    expect(Object.keys(f)).toHaveLength(5);
  });
  it('testCoverage counts code bricks with a test behind them, over code bricks that are not tests', () =>
    expect(m.testCoverage(bp)).toEqual({ tested: 1, of: 2 }));
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
  it('summary reports every figure from the same functions', () =>
    expect(m.summary(bp)).toMatchObject({ files: 5, importEdges: 2, authors: 2, heaviestCodeBrick: 'lib/a.ts' }));
});
