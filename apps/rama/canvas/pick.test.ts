import { describe, expect, it } from 'vitest';
import { fixtureBlueprint } from '../test/blueprint';
import { siteModel } from './frame';
import { pick, toScene } from './pick';

const bp = fixtureBlueprint();
const { scene } = siteModel(bp);
const centre = (path: string) => {
  const b = scene.byPath.get(path)!;
  return [b.x + b.w / 2, b.y + b.h / 2] as const;
};

describe('brick picking', () => {
  it('picks the brick under the point once it is built', () => {
    expect(pick(bp, 3, 1, ...centre('lib/calc.ts'))).toEqual({
      kind: 'brick',
      path: 'lib/calc.ts',
    });
    expect(pick(bp, 3, 1, ...centre('public/logo.png'))).toEqual({
      kind: 'brick',
      path: 'public/logo.png',
    });
  });

  it('does not pick a brick that is not laid yet, or empty space', () => {
    expect(pick(bp, 1, 1, ...centre('lib/fmt.ts'))).toBeNull();
    expect(pick(bp, 3, 1, 1, 1)).toBeNull();
    const b = scene.byPath.get('lib/calc.ts')!;
    expect(pick(bp, 3, 1, b.x + b.w + 1.5, b.y + 2)).not.toEqual({
      kind: 'brick',
      path: 'lib/calc.ts',
    });
  });

  it('finds the Showroom door after the first lift, and the site office always', () => {
    const d = scene.door;
    expect(pick(bp, 0, 0, d.x + 5, d.y + 5)).toBeNull();
    expect(pick(bp, 1, 0, d.x + 5, d.y + 5)).toEqual({ kind: 'door' });
    expect(pick(bp, 0, 0, scene.office.x + 5, scene.office.y + 5)).toEqual({ kind: 'office' });
  });

  it('maps a pointer on a scaled canvas to scene coordinates', () => {
    const rect = { left: 10, top: 20, width: scene.width / 2, height: scene.height / 2 };
    expect(toScene(rect, scene, 10 + 50, 20 + 30)).toEqual({ x: 100, y: 60 });
  });
});
