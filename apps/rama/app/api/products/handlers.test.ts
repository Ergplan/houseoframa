import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import { handleNewProduct, summary, type ProductRouteDeps } from './handlers';

const ravi: Member = { id: 'p2', name: 'Ravi', email: null, role: 'customer' };
const deps = (over: Partial<ProductRouteDeps> = {}): ProductRouteDeps => ({
  member: async () => ravi,
  newProduct: vi.fn(async () => ({
    siteId: 'chai-stall',
    flags: [
      { ok: true, sentence: 'Chai Stall is set up on this laptop.' },
      {
        ok: false,
        sentence: 'The product is kept on this laptop: no GitHub account is set yet.',
        next: 'Enter the GitHub token and account in Settings.',
      },
    ],
  })),
  baseUrl: 'http://rama.test',
  ...over,
});
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('POST /api/products', () => {
  it('starts the product as the picked person and goes to its page with what is still to do', async () => {
    const d = deps();
    const r = await handleNewProduct(
      form({ name: ' Chai Stall ', idea: ' Orders and takings. ' }),
      d,
    );
    expect(d.newProduct).toHaveBeenCalledWith({
      name: 'Chai Stall',
      idea: 'Orders and takings.',
      person: ravi,
    });
    const u = new URL(r.headers.get('location')!);
    expect(u.pathname).toBe('/site/chai-stall');
    expect(u.searchParams.get('error')).toBe(
      'The product is kept on this laptop: no GitHub account is set yet. Enter the GitHub token and account in Settings.',
    );
  });

  it('needs a name and an idea, and someone signed in', async () => {
    const d = deps();
    const r = await handleNewProduct(form({ name: 'X' }), d);
    expect(new URL(r.headers.get('location')!).searchParams.get('error')).toMatch(
      /name and its idea/,
    );
    expect(d.newProduct).not.toHaveBeenCalled();
    const out = deps({ member: async () => new Response(null, { status: 401 }) });
    expect((await handleNewProduct(form({ name: 'X', idea: 'y' }), out)).status).toBe(401);
  });

  it('summary: the last step not done, else the last one', () => {
    expect(
      summary([
        { ok: true, sentence: 'A.' },
        { ok: true, sentence: 'B.' },
      ]),
    ).toEqual({ ok: true, sentence: 'B.' });
    expect(
      summary([
        { ok: false, sentence: 'A.', next: 'Do X.' },
        { ok: true, sentence: 'B.' },
      ]),
    ).toEqual({
      ok: false,
      sentence: 'A. Do X.',
    });
  });
});
