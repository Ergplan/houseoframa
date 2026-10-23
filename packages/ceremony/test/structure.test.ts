import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { confirmedFor, confirmStructure, draftStructure, readStructure } from '../src/structure.ts';

const edge = (from: string, to: string) => ({ from, to, symbols: [] });
const bp = {
  commit: 'c3cccccc',
  nodes: ['a', 'b', 'c', 'd', 'lib/core.ts', 'lib/fmt.ts'].map((p) => ({ path: p })),
  edges: [
    edge('a', 'lib/core.ts'),
    edge('b', 'lib/core.ts'),
    edge('c', 'lib/core.ts'),
    edge('d', 'lib/core.ts'),
    edge('a', 'lib/fmt.ts'),
    edge('b', 'lib/fmt.ts'),
    edge('c', 'lib/fmt.ts'),
    edge('a', 'b'),
  ],
} as unknown as Blueprint;

describe('the structure', () => {
  it('drafts the bricks at least three others import, most first', () => {
    expect(draftStructure(bp)).toEqual([
      { path: 'lib/core.ts', importedBy: 4 },
      { path: 'lib/fmt.ts', importedBy: 3 },
    ]);
  });

  it('is confirmed by a named person into .rama/structure.json, for one commit', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rama-structure-'));
    try {
      expect(readStructure(dir)).toBeNull();
      const s = confirmStructure(dir, bp, 'Asha Rao', new Date('2026-10-23T10:00:00Z'));
      expect(readStructure(dir)).toEqual(s);
      expect(s).toMatchObject({
        commit: 'c3cccccc',
        confirmedBy: 'Asha Rao',
        confirmedAt: '2026-10-23T10:00:00.000Z',
      });
      expect(confirmedFor(s, bp)).toBe(s);
      expect(confirmedFor(s, { ...bp, commit: 'd4dddddd' })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
