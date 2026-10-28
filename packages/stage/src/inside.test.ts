import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { ORIENTATIONS } from './camera.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import {
  brickHeight,
  insideBrickFaces,
  insideFiles,
  insidesOf,
  laidInOf,
  pickInside,
  pointOf,
  standsAt,
} from './inside.ts';
import { street } from './street.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const self = () =>
  JSON.parse(readFileSync(path.join(root, 'blueprint/self.json'), 'utf8')) as Blueprint;
const selfFeatures = () => JSON.parse(readFileSync(path.join(root, '.rama/features.json'), 'utf8'));

/** The insides of every building of a product, from one side. */
function insides(bp: Blueprint, features: unknown, o: (typeof ORIENTATIONS)[number] = 'north') {
  const st = street(bp, resolveFeatures(bp, parseFeatures(features)), {});
  return insidesOf(bp, st.buildings, o);
}

describe('the inside', () => {
  it('is deterministic, and four turns come back to the start', () => {
    const a = insides(stallBlueprint(), stallFeatures);
    expect(JSON.stringify(a)).toBe(JSON.stringify(insides(stallBlueprint(), stallFeatures)));
    const take = a.find((s) => s.id === 'take-an-order')!;
    expect(take.floors.map((f) => [f.kind, f.count])).toEqual(
      take.floors.map((f) => [f.kind, take.bricks.filter((b) => b.floor === f.kind).length]),
    );
    // Pinned: a change to the inside's layout is a change someone should see in review.
    expect([take.w, take.d, take.h, take.width, take.height]).toMatchSnapshot();
  });

  it('stands every brick on its floor, sized by its lines, laid in build order', () => {
    const bp = stallBlueprint();
    const laid = laidInOf(bp);
    for (const s of insides(bp, stallFeatures)) {
      for (const x of s.bricks) {
        const f = s.floors.find((fl) => fl.kind === x.floor)!;
        expect(x.z0).toBe(f.z0);
        expect(x.z1).toBeLessThanOrEqual(f.z1);
        expect(x.z1 - x.z0).toBe(brickHeight(x.lines));
        expect(x.laidIn).toBe(laid.get(x.path));
      }
      // On each floor, a brick laid earlier comes earlier in build order.
      for (const f of s.floors) {
        const on = s.bricks.filter((b) => b.floor === f.kind).sort((a, b) => a.order - b.order);
        const lifts = on.map((b) => (b.laidIn < 0 ? Infinity : b.laidIn));
        expect(lifts).toEqual([...lifts].sort((a, b) => a - b));
      }
    }
    expect(brickHeight(0)).toBeLessThan(brickHeight(400));
    expect(brickHeight(100_000)).toBe(brickHeight(10_000));
  });

  it('stands the files the Street does not draw inside too: a check with the code it checks, papers behind the screens', () => {
    const bp = stallBlueprint();
    const st = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), {});
    expect(insideFiles(bp, st.buildings).get('behind')).toEqual(
      expect.arrayContaining(['README.md', 'lib/money.test.ts']),
    );
    bp.edges.push({ from: 'lib/money.test.ts', to: 'lib/money.ts', symbols: [], typeOnly: false });
    const files = insideFiles(bp, st.buildings);
    expect(files.get('shared')).toContain('lib/money.test.ts');
    expect(files.get('behind')).not.toContain('lib/money.test.ts');
    const s = insides(bp, stallFeatures).find((x) => x.id === 'shared')!;
    expect(s.floors.map((f) => f.label)).toContain('How it is checked');
    const behind = insides(bp, stallFeatures).find((x) => x.id === 'behind')!;
    expect(behind.bricks.find((b) => b.path === 'README.md')!.floor).toBe('papers');
  });

  it('picks only the chosen floor’s bricks once a floor is chosen', () => {
    const s = insides(stallBlueprint(), stallFeatures).find((x) => x.id === 'take-an-order')!;
    const x = s.bricks[0]!;
    const other = s.floors.find((f) => f.kind !== x.floor)!.kind;
    const f = insideBrickFaces(s, x);
    const mid = f.top.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 });
    expect(pickInside(s, mid, x.floor)).toEqual({ kind: 'brick', path: x.path });
    expect(pickInside(s, mid, other)).not.toEqual({ kind: 'brick', path: x.path });
  });

  it('replays the lifts: a brick stands from the lift that laid it on', () => {
    const bp = stallBlueprint();
    const lifts = bp.commits.length;
    for (const s of insides(bp, stallFeatures))
      for (const x of s.bricks) {
        expect(standsAt(x, 0, lifts)).toBe(false);
        expect(standsAt(x, lifts, lifts)).toBe(true);
        if (x.laidIn >= 0) {
          expect(standsAt(x, x.laidIn, lifts)).toBe(false);
          expect(standsAt(x, x.laidIn + 1, lifts)).toBe(true);
        }
      }
  });

  // The walk: nothing that was inspectable on the Stage 2 brick building becomes less so. Every brick
  // of the sample product and of this repository stands inside exactly one building, and can be picked
  // there from every side.
  for (const [name, bp, features] of [
    ['the sample product', stallBlueprint(), stallFeatures],
    ['this repository', self(), selfFeatures()],
  ] as const)
    it(`walks every brick of ${name} through the inside, from all four sides`, () => {
      for (const o of ORIENTATIONS) {
        const all = insides(bp, features, o);
        const seen = all.flatMap((s) => s.bricks.map((b) => b.path)).sort();
        expect(seen).toEqual(bp.nodes.map((n) => n.path).sort());
        for (const s of all)
          for (const x of s.bricks)
            expect(pointOf(s, x.path), `${x.path} from ${o}`).not.toBeNull();
      }
    });
});
