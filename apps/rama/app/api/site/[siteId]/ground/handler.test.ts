import { describe, expect, it, vi } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Blueprint, Table } from '@rama/shared';
import type { GroundRows } from '@rama/workbench';
import { handleGround, type GroundDeps } from './handler';

const site = { id: 'chai', name: 'Chai', kind: 'product' } as SiteLocation;
const orders: Table = {
  name: 'orders',
  file: 'db/schema.ts',
  line: 3,
  symbol: 'orders',
  columns: ['id', 'item'],
};
const rows: GroundRows = {
  columns: ['id', 'item'],
  missing: [],
  rows: [['2', 'Ginger chai']],
  offset: 50,
  more: false,
  total: 51,
  today: 3,
  order: 'newest first, by when each was written',
};
const deps = (over: Partial<GroundDeps> = {}): GroundDeps => ({
  blueprint: () => ({ tables: [orders] }) as unknown as Blueprint,
  source: async () => ({ kind: 'sandbox', url: 'postgres://sbx@db/x' }),
  read: vi.fn(async () => rows),
  ...over,
});
const get = (q: string, d: GroundDeps) =>
  handleGround(site, new URL(`http://rama.test/api/site/chai/ground?${q}`), d);

describe('GET /api/site/:id/ground', () => {
  it('gives a page of the table’s rows from the product’s own database, with its count in words', async () => {
    const d = deps();
    const r = await get('table=orders&offset=50', d);
    expect(r.status).toBe(200);
    expect(d.read).toHaveBeenCalledWith('postgres://sbx@db/x', orders, 50);
    expect(await r.json()).toEqual({
      ok: true,
      page: { connected: true, rows, count: '3 orders today · 51 in all' },
    });
  });

  it('says "Rows not connected" without a source, and never reads', async () => {
    const d = deps({
      source: async () => ({ kind: 'none', why: 'Rows not connected: no address in Settings.' }),
    });
    const body = await (await get('table=orders', d)).json();
    expect(body.page).toEqual({
      connected: false,
      why: 'Rows not connected: no address in Settings.',
    });
    expect(d.read).not.toHaveBeenCalled();
  });

  it('says so when the table is not in that database, or the database does not answer', async () => {
    const absent = await (
      await get('table=orders', deps({ read: async () => ({ absent: true }) }))
    ).json();
    expect(absent.page.why).toBe('The table orders is not in the product’s own database yet.');
    const down = await (
      await get(
        'table=orders',
        deps({
          read: async () => {
            throw new Error('connection refused');
          },
        }),
      )
    ).json();
    expect(down.page.why).toBe(
      'Rows not connected: the database did not answer (connection refused).',
    );
  });

  it('refuses a table the product does not define, and an offset that is not a number', async () => {
    const d = deps();
    expect((await get('table=secrets', d)).status).toBe(404);
    expect((await get('table=orders&offset=-1', d)).status).toBe(400);
    expect((await get('table=orders&offset=1;drop', d)).status).toBe(400);
    expect(d.read).not.toHaveBeenCalled();
  });
});
