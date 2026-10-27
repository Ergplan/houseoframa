// The code level's routes (Stage 11): a file now or at a commit with its blocks and English, the commits
// that touched it, the builder's live edits, and a named confirmation of a drafted sentence.
import { describe, expect, it, vi } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import type { Blueprint } from '@rama/shared';
import type { CodeView } from '@rama/workbench';
import { handleCode, handleConfirm, handleTyping, type CodeDeps } from './handler';

const site = { id: 'chai', name: 'Chai', kind: 'product' } as unknown as SiteLocation;
const asha: Member = { id: 'a1', name: 'Asha Rao', email: null, role: 'customer' };
const HASH = 'a'.repeat(64);
const view: CodeView = {
  path: 'features/new/plan.ts',
  commit: null,
  source: 'export const x = 1;\n',
  blocks: [
    {
      kind: 'value',
      name: 'x',
      from: 1,
      to: 1,
      hash: HASH,
      explanation: { state: 'none' },
      figures: [],
    },
  ],
  change: null,
};
const deps = (): CodeDeps => ({
  blueprint: () =>
    ({
      commits: [
        {
          sha: 'c1',
          at: '2026-10-25T12:00:00Z',
          subject: 'Take an order',
          author: 'Claude Code',
          changes: [{ path: 'features/new/plan.ts' }],
        },
        {
          sha: 'c2',
          at: '2026-10-25T12:10:00Z',
          subject: 'Other',
          author: 'Claude Code',
          changes: [{ path: 'x.ts' }],
        },
      ],
    }) as unknown as Blueprint,
  view: vi.fn((_s, p, _c, href) =>
    p === view.path
      ? {
          ...view,
          blocks: view.blocks.map((b) => ({
            ...b,
            figures: [{ id: 'f', title: 'New order amount', what: '', href: href('new/f') }],
          })),
        }
      : null,
  ),
  confirm: vi.fn(async (_s, hash, who) => ({
    hash,
    path: view.path,
    name: 'x',
    sentence: 's',
    by: who.name,
    at: 'now',
    commit: null,
  })),
  edits: vi.fn(() => [{ at: 10, lift: 1, path: 'features/new/plan.ts', before: null, after: 'x' }]),
  building: () => true,
  buildingOf: () => 'take-an-order',
});
const get = (q: string) => new URL(`http://rama.test/api/site/chai/code?${q}`);

describe('GET code', () => {
  it('gives the file, its blocks, the way to each figure’s trail, and the commits that touched it', async () => {
    const r = (await handleCode(site, get('path=features/new/plan.ts'), deps()).json()) as Record<
      string,
      unknown
    >;
    expect(r).toMatchObject({ ok: true, commits: [{ sha: 'c1', subject: 'Take an order' }] });
    expect((r.view as CodeView).blocks[0]!.figures[0]!.href).toBe(
      '/site/chai?b=take-an-order&figure=new%2Ff',
    );
  });

  it('refuses a path outside the site, a bad commit, and says when the file is not there', async () => {
    expect(handleCode(site, get('path=../../etc/passwd'), deps()).status).toBe(400);
    expect(handleCode(site, get('path=a.ts&commit=HEAD;rm'), deps()).status).toBe(400);
    expect(handleCode(site, get('path=gone.ts&commit=abcdef1'), deps()).status).toBe(404);
  });
});

describe('GET typing and POST explain/confirm', () => {
  it('gives the live edits since a count, and whether the builder is at work', async () => {
    const d = deps();
    expect(await handleTyping(site, new URL('http://rama.test/x?since=3'), d).json()).toMatchObject(
      { ok: true, building: true, edits: [{ path: 'features/new/plan.ts' }] },
    );
    expect(d.edits).toHaveBeenCalledWith('chai', 3);
    expect(handleTyping(site, new URL('http://rama.test/x?since=-1'), d).status).toBe(400);
  });

  it('confirms a drafted sentence as the person, and says why it cannot', async () => {
    const d = deps();
    expect((await handleConfirm(site, asha, { hash: 'nope' }, d)).status).toBe(400);
    expect(await (await handleConfirm(site, asha, { hash: HASH }, d)).json()).toMatchObject({
      ok: true,
      confirmed: { by: 'Asha Rao' },
    });
    d.confirm = async () => {
      throw new Error('this sentence is already confirmed');
    };
    expect(await (await handleConfirm(site, asha, { hash: HASH }, d)).json()).toEqual({
      ok: false,
      sentence: 'this sentence is already confirmed',
    });
  });
});
