import { describe, expect, it } from 'vitest';
import type { Pt } from './iso.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { building, type FacadeInput } from './building.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { brickOnFace, buildingFaces, facadeShape, jettyShapes, plotPolygon } from './geometry.ts';
import { pickBuilding, pickStreet, toPicture } from './pick.ts';
import { streetTimeline } from './replay.ts';
import { street } from './street.ts';

const mid = (pts: Pt[]): Pt => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), {
  shots: { '/': 'orders.png' },
});
const b = (id: string) => s.buildings.find((x) => x.id === id)!;

describe('pickStreet', () => {
  it('finds a facade, a building, a brick through the glass, a plot and a jetty', () => {
    expect(pickStreet(s, mid(buildingFaces(s, b('see-orders')).left))).toEqual({
      kind: 'facade',
      building: 'see-orders',
      screen: '/',
    });
    expect(pickStreet(s, mid(buildingFaces(s, b('shared')).top))).toEqual({
      kind: 'building',
      building: 'shared',
    });
    const take = b('take-an-order');
    const brick = take.floors[0]!.bricks[0]!;
    expect(
      pickStreet(s, mid(brickOnFace(buildingFaces(s, take).right, take.height, brick))),
    ).toEqual({
      kind: 'brick',
      building: 'take-an-order',
      path: 'db/save.ts',
    });
    expect(pickStreet(s, mid(plotPolygon(s, s.plots[0]!)))).toEqual({
      kind: 'plot',
      table: 'orders',
    });
    expect(pickStreet(s, mid(jettyShapes(s, s.jetties[0]!).pier))).toEqual({
      kind: 'jetty',
      service: 'OpenAI',
    });
    expect(pickStreet(s, { x: 1, y: 1 })).toBeNull();
  });

  it('finds nothing where the replay has not built yet', () => {
    const tl = streetTimeline(bp, s);
    const p = mid(buildingFaces(s, b('count-takings')).top);
    expect(pickStreet(s, p, { timeline: tl, k: 1, p: 1 })).toBeNull();
    expect(pickStreet(s, p, { timeline: tl, k: 3, p: 1 })).toEqual({
      kind: 'building',
      building: 'count-takings',
    });
  });

  it('scales a pointer on a smaller canvas element to the picture', () => {
    expect(
      toPicture(
        { left: 10, top: 20, width: 500, height: 250 },
        { width: 1000, height: 500 },
        260,
        145,
      ),
    ).toEqual({
      x: 500,
      y: 250,
    });
  });
});

describe('building and pickBuilding', () => {
  const facade: FacadeInput = {
    screen: '/',
    title: 'Today’s orders',
    shot: 'orders.png',
    width: 390,
    height: 1600,
    figures: [
      {
        key: '/~order-count',
        id: 'order-count',
        traced: true,
        text: '4',
        box: { x: 20, y: 100, w: 40, h: 30 },
      },
      { key: '/~late', id: 'late', traced: false, box: { x: 20, y: 1500, w: 40, h: 30 } },
    ],
  };
  const nodeOf = (p: string) => bp.nodes.find((n) => n.path === p)!;
  const sc = building(b('see-orders'), [facade], nodeOf, new Set(bp.screens.map((x) => x.file)));

  it('puts the screen on the facade, cropped to the top, with each figure where the screen shows it', () => {
    const panel = sc.facades[0]!;
    expect(panel.shot).toBe('orders.png');
    expect(panel.crop!.sh).toBeLessThan(1600);
    expect(panel.vEnd).toBe(1);
    expect(panel.figures[0]!.at).not.toBeNull();
    // Below what the face shows: no hotspot, but still listed.
    expect(panel.figures[1]!.at).toBeNull();
    expect(sc.floors.map((f) => f.kind)).toEqual(['remembers', 'shows']);
  });

  it('is deterministic', () => {
    const again = building(
      b('see-orders'),
      [facade],
      nodeOf,
      new Set(bp.screens.map((x) => x.file)),
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(sc));
  });

  it('picks a figure, the facade around it, and a brick through the side', () => {
    const g = sc.facades[0]!.figures[0]!.at!;
    expect(pickBuilding(sc, mid(facadeShape(sc, g.u0, g.u1, g.v0, g.v1)))).toEqual({
      kind: 'figure',
      screen: '/',
      key: '/~order-count',
      traced: true,
    });
    expect(pickBuilding(sc, mid(facadeShape(sc, 0.5, 0.6, 0.8, 0.9)))).toEqual({
      kind: 'facade',
      screen: '/',
    });
    const brick = sc.floors[0]!.bricks[0]!;
    expect(pickBuilding(sc, mid(brickOnFace(sc.faces.right, sc.h, brick)))).toEqual({
      kind: 'brick',
      path: 'db/orders.ts',
    });
  });

  it('leaves a facade blank until the screen is photographed', () => {
    const bare = building(b('take-an-order'), [], nodeOf, new Set());
    expect(bare.facades).toEqual([
      expect.objectContaining({ screen: '/new', shot: null, crop: null, figures: [] }),
    ]);
  });
});
