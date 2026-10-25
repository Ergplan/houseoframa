import { describe, expect, it } from 'vitest';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { floorOf, street } from './street.ts';

const make = (shots: Record<string, string> = {}) => {
  const bp = stallBlueprint();
  return street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), { shots });
};

describe('street', () => {
  it('is deterministic: the same Blueprint and features give the same Street', () => {
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
    const s = make();
    // Pinned: a change to the layout is a change someone should see in review.
    expect(s.buildings.map((b) => [b.id, b.gx, b.gy, b.side, b.height])).toEqual([
      ['see-orders', 2, 2, 2, 56],
      ['take-an-order', 8, 2, 2, 66],
      ['count-takings', 14, 2, 2, 56],
      ['shared', 2, 8, 2, 56],
      ['behind', 8, 8, 2, 56],
    ]);
    expect([s.width, s.height, s.origin]).toEqual([1408, 960, { x: 536, y: 256 }]);
  });

  it('lays buildings on a grid, a building per thing the product does, in the features file’s order', () => {
    const s = make();
    expect(s.buildings.map((b) => b.name)).toEqual([
      'See today’s orders',
      'Take an order',
      'Count the takings',
      'Shared by several',
      'Behind the screens',
    ]);
    // Three columns: five buildings in two rows of slots, nothing overlapping.
    const cells = s.buildings.map((b) => `${Math.floor(b.gx / 6)},${Math.floor(b.gy / 6)}`);
    expect(new Set(cells).size).toBe(5);
  });

  it('puts each file on its floor: remembers, decides, talks to, shows', () => {
    const s = make();
    const take = s.buildings.find((b) => b.id === 'take-an-order')!;
    expect(take.floors.map((f) => [f.kind, f.bricks.map((x) => x.path)])).toEqual([
      ['remembers', ['db/save.ts']],
      ['talks', ['lib/ask.ts']],
      ['shows', ['app/new/page.tsx']],
    ]);
    const bp = stallBlueprint();
    expect(
      floorOf(
        bp.nodes.find((n) => n.path === 'lib/money.ts')!,
        new Set(),
      ),
    ).toBe('decides');
  });

  it('lights the table plots a building reads or writes', () => {
    const s = make();
    expect(s.plots).toEqual([
      expect.objectContaining({
        table: 'orders',
        readBy: ['see-orders'],
        writtenBy: ['take-an-order'],
      }),
    ]);
    expect(s.buildings.find((b) => b.id === 'take-an-order')!.tables).toEqual([
      { name: 'orders', reads: false, writes: true },
    ]);
  });

  it('draws a road for each building that uses another, dotted when only a type crosses', () => {
    const s = make();
    expect(s.roads.map((r) => [r.from, r.to, r.typeOnly, r.uses])).toEqual([
      ['count-takings', 'see-orders', true, 1],
      ['count-takings', 'shared', false, 1],
      ['see-orders', 'shared', false, 2],
      ['take-an-order', 'shared', false, 1],
    ]);
    for (const r of s.roads) expect(r.points.length).toBeGreaterThanOrEqual(4);
  });

  it('sets the outside services across the water as jetties', () => {
    const s = make();
    expect(s.jetties.map((j) => [j.service, j.users])).toEqual([['OpenAI', ['take-an-order']]]);
    expect(s.lake.gx0).toBe(s.ground.gx1);
    expect(s.bank.gx1).toBeGreaterThan(s.bank.gx0);
  });

  it('puts the real screen on a facade once the screens are photographed', () => {
    expect(make().buildings[0]!.facades).toEqual([{ screen: '/', shot: null }]);
    expect(make({ '/': 'orders.png' }).buildings[0]!.facades).toEqual([
      { screen: '/', shot: 'orders.png' },
    ]);
    // The shared work and the work behind the screens have no facade.
    expect(make().buildings.find((b) => b.id === 'shared')!.facades).toEqual([]);
  });
});
