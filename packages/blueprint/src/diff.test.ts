import { describe, expect, it } from 'vitest';
import type { Blueprint } from '@rama/shared';
import { diffBlueprints, formatDiff } from './diff.ts';

const base: Blueprint = {
  repo: 'r',
  commit: 'c1',
  worktree: false,
  extractedAt: '',
  extractorVersion: '1',
  layers: [],
  nodes: [
    { path: 'a.ts', layer: 'logic', layerRule: 't', lines: 1, bytes: 1, binary: false, test: false, exports: [], env: [], envDynamic: false, firstCommit: '', lastCommit: '', changes: 1 },
  ],
  edges: [],
  unresolved: [],
  external: [],
  commits: [],
  branches: [],
  tags: [],
  screens: [],
};

describe('diffBlueprints', () => {
  it('says identical for identical Blueprints', () => {
    const d = diffBlueprints(base, structuredClone(base));
    expect(d.identical).toBe(true);
    expect(formatDiff(d)).toBe('identical');
  });

  it('names added and changed bricks, new edges, header changes and moved metrics', () => {
    const next = structuredClone(base);
    next.commit = 'c2';
    next.nodes[0]!.lines = 5;
    next.nodes.push({ ...next.nodes[0]!, path: 'b.ts' });
    next.edges.push({ from: 'b.ts', to: 'a.ts', symbols: ['x'], typeOnly: false });
    const d = diffBlueprints(base, next);
    expect(d.identical).toBe(false);
    expect(d.header).toEqual([{ field: 'commit', a: 'c1', b: 'c2' }]);
    expect(d.nodes.added).toEqual(['b.ts']);
    expect(d.nodes.changed).toEqual([{ path: 'a.ts', fields: ['lines'] }]);
    expect(d.edges.added).toEqual(['b.ts → a.ts']);
    expect(d.metrics.map((x) => x.name)).toEqual(expect.arrayContaining(['files', 'textLines', 'importEdges']));
    expect(formatDiff(d)).toContain('bricks added (1):\n  b.ts');
  });
});
