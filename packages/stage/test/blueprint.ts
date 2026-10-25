// A small product for the lakefront's tests: three screens (two share a money file), one table read by
// one building and written by another, an outside service, a file no screen uses, a test and a document.
import type { Blueprint, BrickNode, Commit } from '@rama/shared';

const node = (path: string, layer: string, over: Partial<BrickNode> = {}): BrickNode => ({
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
  firstCommit: 'c1',
  lastCommit: 'c1',
  changes: 1,
  ...over,
});

const commit = (sha: string, at: string, paths: string[]): Commit => ({
  sha,
  short: sha,
  at,
  author: 'Rama Builder',
  subject: `lift ${sha}`,
  changes: paths.map((path) => ({ path, kind: 'A', add: 10, del: 0 })),
});

export function stallBlueprint(): Blueprint {
  return {
    repo: 'stall',
    commit: 'c3',
    worktree: false,
    extractedAt: '2026-10-01T03:00:00+05:30',
    extractorVersion: 'test',
    layers: [
      { id: 'data', label: 'Data' },
      { id: 'logic', label: 'Logic' },
      { id: 'shell', label: 'Shell' },
    ],
    nodes: [
      node('db/schema.ts', 'data', { exports: ['orders'] }),
      node('db/orders.ts', 'data', { tables: [{ name: 'orders', reads: true, writes: false }] }),
      node('db/save.ts', 'data', {
        tables: [{ name: 'orders', reads: false, writes: true }],
        firstCommit: 'c2',
      }),
      node('lib/money.ts', 'logic'),
      node('lib/ask.ts', 'logic', { packages: ['openai'], firstCommit: 'c2' }),
      node('lib/money.test.ts', 'logic', { test: true }),
      node('scripts/seed.ts', 'logic', { firstCommit: 'c3' }),
      node('app/page.tsx', 'shell', { firstCommit: 'c2' }),
      node('app/new/page.tsx', 'shell', { firstCommit: 'c2' }),
      node('app/total/page.tsx', 'shell', { firstCommit: 'c3' }),
      node('README.md', 'shell'),
    ],
    edges: [
      { from: 'app/page.tsx', to: 'db/orders.ts', symbols: ['todaysOrders'], typeOnly: false },
      { from: 'app/page.tsx', to: 'lib/money.ts', symbols: ['orderAmount'], typeOnly: false },
      { from: 'app/new/page.tsx', to: 'db/save.ts', symbols: ['save'], typeOnly: false },
      { from: 'app/new/page.tsx', to: 'lib/ask.ts', symbols: ['ask'], typeOnly: false },
      { from: 'app/total/page.tsx', to: 'lib/money.ts', symbols: ['dayTotal'], typeOnly: false },
      { from: 'app/total/page.tsx', to: 'db/orders.ts', symbols: ['Order'], typeOnly: true },
      { from: 'db/orders.ts', to: 'db/schema.ts', symbols: ['orders'], typeOnly: false },
      { from: 'db/save.ts', to: 'db/schema.ts', symbols: ['orders'], typeOnly: false },
    ],
    unresolved: [],
    external: [],
    commits: [
      commit('c1', '2026-10-01T01:00:00+05:30', [
        'db/schema.ts',
        'db/orders.ts',
        'lib/money.ts',
        'lib/money.test.ts',
        'README.md',
      ]),
      commit('c2', '2026-10-01T02:00:00+05:30', [
        'db/save.ts',
        'lib/ask.ts',
        'app/page.tsx',
        'app/new/page.tsx',
      ]),
      commit('c3', '2026-10-01T03:00:00+05:30', ['scripts/seed.ts', 'app/total/page.tsx']),
    ],
    branches: ['main'],
    tags: [],
    screens: [
      {
        id: '/',
        name: 'Home',
        route: '/',
        file: 'app/page.tsx',
        bricks: ['app/page.tsx', 'db/orders.ts', 'db/schema.ts', 'lib/money.ts'],
      },
      {
        id: '/new',
        name: 'New',
        route: '/new',
        file: 'app/new/page.tsx',
        bricks: ['app/new/page.tsx', 'db/save.ts', 'db/schema.ts', 'lib/ask.ts'],
      },
      {
        id: '/total',
        name: 'Total',
        route: '/total',
        file: 'app/total/page.tsx',
        bricks: ['app/total/page.tsx', 'lib/money.ts'],
      },
    ],
    tables: [
      { name: 'orders', file: 'db/schema.ts', line: 3, symbol: 'orders', columns: ['id', 'cups'] },
    ],
  };
}

export const stallFeatures = {
  features: [
    { id: 'see-orders', name: 'See today’s orders', does: 'Lists the orders.', screens: ['/'] },
    { id: 'take-an-order', name: 'Take an order', does: 'Writes a new order.', screens: ['/new'] },
    {
      id: 'count-takings',
      name: 'Count the takings',
      screens: ['Total'],
      confirmedBy: 'Asha',
      confirmedAt: '2026-10-02',
    },
  ],
};
