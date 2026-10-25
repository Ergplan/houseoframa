import { describe, expect, it } from 'vitest';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { craneAt, hourOf, laid, liftChip, streetTimeline } from './replay.ts';
import { street } from './street.ts';
import { standingHeight } from './draw.ts';

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)));
const tl = streetTimeline(bp, s);

describe('the replay over the Street', () => {
  it('lays each file in the lift that added it, building by building', () => {
    expect(tl.lifts.map((l) => l.events.map((e) => `${e.building}:${e.path}`))).toEqual([
      ['see-orders:db/orders.ts', 'shared:db/schema.ts', 'shared:lib/money.ts'],
      [
        'see-orders:app/page.tsx',
        'take-an-order:db/save.ts',
        'take-an-order:lib/ask.ts',
        'take-an-order:app/new/page.tsx',
      ],
      ['count-takings:app/total/page.tsx', 'behind:scripts/seed.ts'],
    ]);
    expect([
      laid(tl, 'db/save.ts', 1, 1),
      laid(tl, 'db/save.ts', 2, 0.3),
      laid(tl, 'db/save.ts', 2, 1),
    ]).toEqual(['none', 'placing', 'built']);
  });

  it('raises a building as its floors are laid', () => {
    const take = s.buildings.find((b) => b.id === 'take-an-order')!;
    expect(standingHeight(take, { replay: { timeline: tl, k: 1, p: 1 } })).toBe(0);
    expect(standingHeight(take, { replay: { timeline: tl, k: 2, p: 0.3 } })).toBe(
      take.floors[0]!.z1,
    );
    expect(standingHeight(take, { replay: { timeline: tl, k: 2, p: 1 } })).toBe(take.height);
  });

  it('parks the crane at the building being built', () => {
    expect(craneAt(tl, 2, 0.3)).toBe('take-an-order');
    expect(craneAt(tl, 2, 1)).toBe('take-an-order');
    expect(craneAt(tl, 0, 0)).toBeNull();
  });

  it('reads the clock in the commit’s own time zone', () => {
    expect(liftChip(tl, 2)).toBe('Lift 2 · 02:00');
    expect(hourOf(tl, 3)).toBe(3);
    expect(liftChip(tl, 0)).toBeNull();
  });
});
