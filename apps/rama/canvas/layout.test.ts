import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Blueprint } from '@rama/shared';
import { fixtureBlueprint, node } from '../test/blueprint';
import {
  BRICK_H,
  MAX_BUILDING_W,
  MAX_CRANES,
  MAX_SCAFFOLDS,
  MIN_BUILDING_W,
  brickWidth,
  layout,
} from './layout';

const self = JSON.parse(
  readFileSync(new URL('../../../blueprint/self.json', import.meta.url), 'utf8'),
) as Blueprint;
const plain = (bp: Blueprint) => {
  const s = layout(bp);
  return JSON.stringify({ ...s, byPath: [...s.byPath.keys()] });
};

describe('layout', () => {
  it('is deterministic: the same Blueprint gives the same scene, whatever the node order', () => {
    const bp = fixtureBlueprint();
    const shuffled = { ...bp, nodes: [...bp.nodes].reverse() };
    expect(plain(bp)).toBe(plain(fixtureBlueprint()));
    expect(plain(shuffled)).toBe(plain(bp));
    expect(plain(self)).toBe(plain(structuredClone(self)));
  });

  it('stacks floors bottom to top in layer order and keeps every brick inside its floor', () => {
    const s = layout(fixtureBlueprint());
    expect(s.floors.map((f) => f.id)).toEqual(['data', 'logic', 'shell']);
    expect(s.floors[0]!.y).toBeGreaterThan(s.floors[1]!.y);
    for (const f of s.floors) {
      for (const p of f.paths) {
        const b = s.byPath.get(p)!;
        expect(b.y).toBeGreaterThanOrEqual(f.y);
        expect(b.y + b.h).toBeLessThanOrEqual(f.y + f.h);
        expect(b.x).toBeGreaterThanOrEqual(s.building.x);
        expect(b.x + b.w).toBeLessThanOrEqual(s.building.x + s.building.w);
      }
    }
    expect(s.top).toBe(s.floors.at(-1)!.y - 6);
  });

  it('never overlaps two bricks, on a real repository', () => {
    const s = layout(self);
    expect(s.bricks).toHaveLength(self.nodes.length);
    const sorted = [...s.bricks].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.y === b.y) expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    }
  });

  it('log-scales brick width by lines, within 18–150', () => {
    expect(brickWidth(0)).toBe(18);
    expect(brickWidth(367)).toBe(91);
    expect(brickWidth(1_000_000)).toBe(150);
    expect(layout(fixtureBlueprint()).byPath.get('lib/data.ts')).toMatchObject({
      w: 91,
      h: BRICK_H,
    });
  });

  it('marks code with no test behind it, and binaries', () => {
    const s = layout(fixtureBlueprint());
    expect(s.byPath.get('lib/calc.ts')!.untested).toBe(false);
    expect(s.byPath.get('lib/fmt.ts')!.untested).toBe(true);
    expect(s.byPath.get('lib/calc.test.ts')!.untested).toBe(false);
    expect(s.byPath.get('public/logo.png')).toMatchObject({ untested: false, binary: true });
  });

  it('grows the building with the number of bricks, within bounds', () => {
    const many = {
      ...fixtureBlueprint(),
      nodes: Array.from({ length: 900 }, (_, i) => node(`f${i}.ts`, 'logic', { lines: 150 })),
    };
    const w = layout(many).building.w;
    expect(w).toBeGreaterThan(MIN_BUILDING_W);
    expect(w).toBeLessThanOrEqual(MAX_BUILDING_W);
    expect(layout(fixtureBlueprint()).building.w).toBe(MIN_BUILDING_W);
  });

  it('puts a crane per builder in order of first commit, jibs toward the middle; the rest share a crane', () => {
    const s = layout(fixtureBlueprint());
    expect(s.cranes.map((c) => [c.author, c.jib])).toEqual([
      ['Joulewise', 'right'],
      ['Rachit', 'left'],
    ]);
    const crowd = fixtureBlueprint();
    crowd.commits = Array.from({ length: 9 }, (_, i) => ({
      ...crowd.commits[0]!,
      sha: `s${i}`,
      author: `Builder ${i}`,
    }));
    const c = layout(crowd).cranes;
    expect(c).toHaveLength(MAX_CRANES);
    expect(c.at(-1)!.author).toBe('+4 more');
  });

  it('puts a scaffold per branch, up to a limit, and an office beyond them', () => {
    const bp = fixtureBlueprint();
    bp.branches = Array.from({ length: 9 }, (_, i) => `b${i}`);
    const s = layout(bp);
    expect(s.scaffolds).toHaveLength(MAX_SCAFFOLDS);
    expect(s.moreBranches).toBe(3);
    expect(s.office.x).toBeGreaterThan(s.scaffolds.at(-1)!.x);
    expect(s.width).toBeGreaterThan(s.office.x + s.office.w);
    expect(layout({ ...bp, branches: [] }).scaffolds).toEqual([]);
  });

  it('gives a floor a target defines for itself a place and a colour', () => {
    const bp = fixtureBlueprint();
    bp.nodes.push(node('design/tokens.json', 'design'));
    const s = layout(bp);
    expect(s.floors.at(-1)).toMatchObject({ id: 'design', short: 'DESIGN' });
    expect(s.floors.at(-1)!.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
