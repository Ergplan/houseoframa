import { describe, expect, it, vi } from 'vitest';
import type { Blueprint } from '@rama/shared';
import type { call } from '@rama/model';
import { draftGlossary, draftPurposes, missingPhrases, missingPurposes, DRAFT_COMPONENT, PURPOSE_COMPONENT } from './draft.ts';

const bp = {
  repo: 'r',
  edges: [
    { from: 'app/page.tsx', to: 'lib/calc.ts', symbols: ['total', 'default'], typeOnly: false },
    { from: 'app/x.tsx', to: 'lib/calc.ts', symbols: ['total', '*'], typeOnly: false },
    { from: 'app/x.tsx', to: 'lib/data.ts', symbols: ['ROWS'], typeOnly: false },
  ],
} as unknown as Blueprint;
const files: Record<string, string> = {
  'lib/calc.ts': 'import x from "y";\nexport const total = () => 1;\nexport default function calc() {}\n',
  'lib/data.ts': 'export const ROWS = [];\n',
};
const read = (p: string) => files[p] ?? null;

describe('glossary drafting', () => {
  it('asks only for symbols with no phrase, once each, grounded in their declaration', () => {
    const todo = missingPhrases(bp, { ROWS: { text: 'the rows' } }, read);
    expect(todo.map((t) => t.key)).toEqual(['lib/calc.ts#default', 'lib/calc.ts#total']);
    expect(todo[1]!.declaration.startsWith('export const total')).toBe(true);
    expect(todo[0]!.declaration.startsWith('export default function calc')).toBe(true);
  });

  it('calls packages/model as the builder with glossary.v1 and returns unconfirmed drafts for asked keys only', async () => {
    const fake = vi.fn(async () => ({
      output: {
        phrases: [
          { key: 'lib/calc.ts#total', text: ' the total ' },
          { key: 'lib/other.ts#sneaky', text: 'not asked for' },
        ],
      },
    })) as unknown as typeof call;
    const drafted = await draftGlossary(bp, {}, read, { siteId: 'self', call: fake });
    expect(drafted).toEqual({ 'lib/calc.ts#total': { text: 'the total' } });
    expect(fake).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'glossary', version: 1, role: 'builder', siteId: 'self', createdBy: DRAFT_COMPONENT }),
    );
  });

  it('makes no call when nothing is missing', async () => {
    const fake = vi.fn() as unknown as typeof call;
    const all = { total: { text: 't' }, 'lib/calc.ts#default': { text: 'd' }, ROWS: { text: 'r' } };
    expect(await draftGlossary(bp, all, read, { siteId: 'self', call: fake })).toEqual({});
    expect(fake).not.toHaveBeenCalled();
  });
});

describe('purpose drafting', () => {
  const nodesBp = {
    repo: 'r',
    nodes: [
      { path: 'lib/calc.ts', layer: 'logic', lines: 3, binary: false, exports: ['total', 'default'] },
      { path: 'lib/data.ts', layer: 'data', lines: 1, binary: false, exports: ['ROWS'] },
      { path: 'public/logo.png', layer: 'data', lines: 0, binary: true, exports: [] },
      { path: 'empty.txt', layer: 'shell', lines: 0, binary: false, exports: [] },
    ],
  } as unknown as Blueprint;

  it('asks only for text bricks with no purpose, with the head of each file', () => {
    const todo = missingPurposes(nodesBp, { 'lib/data.ts': { text: 'The rows.' } }, read);
    expect(todo).toEqual([
      { path: 'lib/calc.ts', floor: 'logic', lines: 3, exports: ['total', 'default'], head: files['lib/calc.ts'] },
    ]);
  });

  it('calls packages/model as the builder with purpose.v1 and keeps unconfirmed drafts for asked paths only', async () => {
    const fake = vi.fn(async () => ({
      output: {
        purposes: [
          { path: 'lib/calc.ts', text: ' Adds things up. ' },
          { path: 'lib/elsewhere.ts', text: 'Not asked for.' },
        ],
      },
    })) as unknown as typeof call;
    expect(await draftPurposes(nodesBp, {}, read, { siteId: 'ekbill', call: fake })).toEqual({
      'lib/calc.ts': { text: 'Adds things up.' },
    });
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'purpose', version: 1, role: 'builder', siteId: 'ekbill', createdBy: PURPOSE_COMPONENT }),
    );
  });

  it('skips a batch that fails after retries when asked to, and drafts the rest', async () => {
    const many = { ...nodesBp, nodes: Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.ts`, layer: 'logic', lines: 1, binary: false, exports: [] })) } as unknown as Blueprint;
    const text = (p: string) => (p.startsWith('f') ? 'export const x = 1;\n' : null);
    let n = 0;
    const flaky = vi.fn(async (req: { input: { files: { path: string }[] } }) => {
      if (n++ === 0) throw new Error('reply is not JSON');
      return { output: { purposes: req.input.files.map((f) => ({ path: f.path, text: 'A file.' })) } };
    }) as unknown as typeof call;
    const skipped: string[][] = [];
    const drafted = await draftPurposes(many, {}, text, { siteId: 's', call: flaky, onError: (_e, keys) => skipped.push(keys) });
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toHaveLength(10); // the first batch of ten
    expect(Object.keys(drafted)).toHaveLength(2);
    // Without onError the failure is thrown.
    n = 0;
    await expect(draftPurposes(many, {}, text, { siteId: 's', call: flaky })).rejects.toThrow('reply is not JSON');
  });
});
