// A small Blueprint for the app's tests: three floors, two builders, one demolition, one test.
import type { Blueprint, BrickNode, Commit, ImportEdge } from '@rama/shared';

export const node = (path: string, layer: string, over: Partial<BrickNode> = {}): BrickNode => ({
  path,
  layer,
  layerRule: `test: ${layer}`,
  lines: 10,
  bytes: 100,
  binary: false,
  test: false,
  exports: [],
  env: [],
  envDynamic: false,
  firstCommit: 'c1aaaaaa',
  lastCommit: 'c1aaaaaa',
  changes: 1,
  ...over,
});

export const edge = (
  from: string,
  to: string,
  symbols: string[],
  over: Partial<ImportEdge> = {},
): ImportEdge => ({
  from,
  to,
  symbols,
  typeOnly: false,
  ...over,
});

const commit = (
  sha: string,
  at: string,
  author: string,
  subject: string,
  changes: Commit['changes'],
): Commit => ({
  sha,
  short: sha.slice(0, 7),
  at,
  author,
  subject,
  changes,
});

export function fixtureBlueprint(): Blueprint {
  return {
    repo: 'fixture',
    commit: 'c3cccccc',
    worktree: false,
    extractedAt: '2026-09-28T17:41:59+05:30',
    extractorVersion: 'test',
    layers: [
      { id: 'data', label: 'Data — datasets' },
      { id: 'logic', label: 'Logic — library code' },
      { id: 'shell', label: 'Shell — routes' },
    ],
    nodes: [
      node('app/page.tsx', 'shell', { firstCommit: 'c1aaaaaa', changes: 1 }),
      node('lib/calc.test.ts', 'logic', { test: true, firstCommit: 'c2bbbbbb' }),
      node('lib/calc.ts', 'logic', {
        lines: 84,
        exports: ['total'],
        firstCommit: 'c1aaaaaa',
        changes: 3,
        env: ['RATE'],
      }),
      node('lib/data.ts', 'data', {
        lines: 367,
        exports: ['ROWS', 'Row'],
        firstCommit: 'c1aaaaaa',
        changes: 2,
        purpose: {
          text: 'The rows the app counts.',
          confirmed: true,
          by: 'Asha',
          at: '2026-01-05',
        },
      }),
      node('lib/fmt.ts', 'logic', { lines: 12, exports: ['money'], firstCommit: 'c2bbbbbb' }),
      node('public/logo.png', 'data', { binary: true, lines: 0, firstCommit: 'c1aaaaaa' }),
    ],
    edges: [
      edge('app/page.tsx', 'lib/calc.ts', ['total'], {
        english: { text: 'the row count', confirmed: false },
      }),
      edge('app/page.tsx', 'lib/fmt.ts', ['money']),
      edge('lib/calc.test.ts', 'lib/calc.ts', ['total']),
      edge('lib/calc.ts', 'lib/data.ts', ['ROWS', 'Row'], {
        english: {
          text: 'the rows; the shape of a row',
          confirmed: true,
          by: 'Asha',
          at: '2026-01-05',
        },
      }),
      edge('lib/fmt.ts', 'lib/data.ts', ['Row'], { typeOnly: true }),
    ],
    unresolved: [],
    external: [],
    commits: [
      commit('c1aaaaaa', '2026-09-28T11:07:13+00:00', 'Joulewise', 'First lift', [
        { path: 'app/page.tsx', kind: 'A', add: 10, del: 0 },
        { path: 'lib/calc.ts', kind: 'A', add: 80, del: 0 },
        { path: 'lib/data.ts', kind: 'A', add: 367, del: 0 },
        { path: 'public/logo.png', kind: 'A', add: null, del: null },
      ]),
      commit('c2bbbbbb', '2026-09-28T16:51:02+05:30', 'Rachit', 'Second lift', [
        { path: 'lib/calc.test.ts', kind: 'A', add: 10, del: 0 },
        { path: 'lib/calc.ts', kind: 'M', add: 30, del: 26 },
        { path: 'lib/fmt.ts', kind: 'A', add: 12, del: 0 },
      ]),
      commit('c3cccccc', '2026-09-28T17:41:59+05:30', 'Rachit', 'Third lift', [
        { path: 'lib/calc.ts', kind: 'M', add: 4, del: 1 },
        { path: 'lib/data.ts', kind: 'M', add: 1, del: 1 },
        { path: 'gone.txt', kind: 'D', add: 0, del: 30 },
      ]),
    ],
    branches: ['main'],
    tags: [],
    screens: [],
  };
}
