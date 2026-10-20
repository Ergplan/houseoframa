import { describe, expect, it, vi } from 'vitest';
import type { Blueprint } from '@rama/shared';
import type { call } from '@rama/model';
import { draftGlossary, missingPhrases, DRAFT_COMPONENT } from './draft.ts';

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
