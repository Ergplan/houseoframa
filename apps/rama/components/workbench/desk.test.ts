import { describe, expect, it } from 'vitest';
import { latestFile } from './desk';

const commit = (at: string, changes: { path: string; kind: 'A' | 'M' | 'D'; add: number }[]) => ({
  sha: at,
  short: at,
  at,
  author: 'Builder',
  subject: at,
  changes: changes.map((c) => ({ ...c, del: 0 })),
});

describe('latestFile', () => {
  it('opens on the code file the newest commit changed most', () => {
    const bp = {
      nodes: [{ path: 'db/bills.ts' }, { path: 'app/page.tsx' }, { path: 'features/size.ts' }],
      commits: [
        commit('2026-10-29T10:00:00Z', [{ path: 'db/bills.ts', kind: 'A', add: 90 }]),
        commit('2026-10-29T11:00:00Z', [
          { path: 'README.md', kind: 'M', add: 200 },
          { path: 'app/page.tsx', kind: 'M', add: 4 },
          { path: 'features/size.ts', kind: 'A', add: 60 },
        ]),
      ],
    } as never;
    expect(latestFile(bp)).toBe('features/size.ts');
  });

  it('passes over deleted files and commits with no code, and gives null when none', () => {
    const bp = {
      nodes: [{ path: 'db/bills.ts' }],
      commits: [
        commit('2026-10-29T10:00:00Z', [{ path: 'db/bills.ts', kind: 'A', add: 9 }]),
        commit('2026-10-29T11:00:00Z', [{ path: 'old.ts', kind: 'D', add: 0 }]),
      ],
    } as never;
    expect(latestFile(bp)).toBe('db/bills.ts');
    expect(latestFile({ nodes: [], commits: [] })).toBeNull();
  });
});
