import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { building, type FacadeInput } from './building.ts';
import {
  camera,
  cameraFrom,
  cameraQuery,
  HAND_OFF,
  ORIENTATIONS,
  orientScene,
  orientStreet,
  startCamera,
  unview,
  viewTransform,
  type Camera,
} from './camera.ts';
import { drawBuilding, drawStreet } from './draw.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { brickOnFace, buildingFaces, facadeShape, floorFaceOf, plotPolygon } from './geometry.ts';
import { inPolygon, type Pt } from './iso.ts';
import { paletteFromTokens } from './palette.ts';
import { pickBuilding, pickStreet } from './pick.ts';
import { street } from './street.ts';

const mid = (pts: Pt[]): Pt => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), {
  shots: { '/': 'orders.png' },
});
const pal = paletteFromTokens(tokens, 'dark');

describe('the camera', () => {
  it('turns in quarter steps: right, left and around', () => {
    let c = startCamera();
    c = camera(c, { type: 'turn', by: 'right' });
    expect(c.orientation).toBe('east');
    c = camera(c, { type: 'turn', by: 'around' });
    expect(c.orientation).toBe('west');
    c = camera(c, { type: 'turn', by: 'left' });
    expect(c.orientation).toBe('south');
    expect(
      ORIENTATIONS.reduce((x) => camera(x, { type: 'turn', by: 'right' }), c).orientation,
    ).toBe('south');
  });

  it('zooms within a level, keeping the point under the pointer still', () => {
    const c = camera(startCamera(), { type: 'zoom', factor: 2, at: { x: 0.75, y: 0.5 } });
    expect(c).toMatchObject({ level: 'street', scale: 2, centre: { x: 0.625, y: 0.5 } });
    const size = { width: 1000, height: 600 };
    // The picture point that was under the pointer is still under it.
    const t = viewTransform(c, size);
    expect(0.75 * size.width * t.scale + t.dx).toBeCloseTo(750);
    expect(unview({ x: 750, y: 300 }, c, size)).toEqual({ x: 750, y: 300 });
    // Further than the whole picture at the Street: held there.
    expect(camera(startCamera(), { type: 'zoom', factor: 0.1 }).scale).toBe(0.6);
    // Already zoomed: the point under the pointer still stays under it (reviewer run 7).
    const twice = camera(
      { ...startCamera(), scale: 2 },
      { type: 'zoom', factor: 2, at: { x: 0.75, y: 0.5 } },
    );
    expect(twice.centre.x).toBeCloseTo(0.5625);
    const under = (c: typeof twice, vx: number) => c.centre.x + (vx - 0.5) / c.scale;
    expect(under(twice, 0.75)).toBeCloseTo(under({ ...startCamera(), scale: 2 }, 0.75));
  });

  it('hands off between the levels: into a building, into its floors, and back out', () => {
    let c: Camera = { ...startCamera(), scale: HAND_OFF / 1.25 + 0.01 };
    // Zooming close onto empty ground does not open anything.
    expect(camera(c, { type: 'zoom', factor: 1.25, over: null }).level).toBe('street');
    c = camera(c, { type: 'zoom', factor: 1.25, over: { building: 'take-an-order' } });
    expect(c).toMatchObject({ level: 'building', building: 'take-an-order', scale: 1 });
    c = camera({ ...c, scale: HAND_OFF }, { type: 'zoom', factor: 1.25 });
    expect(c).toMatchObject({ level: 'code', building: 'take-an-order', scale: 1 });
    c = camera({ ...c, scale: 0.65 }, { type: 'zoom', factor: 0.8 });
    expect(c).toMatchObject({ level: 'building', building: 'take-an-order' });
    c = camera({ ...c, scale: 0.65 }, { type: 'zoom', factor: 0.8 });
    expect(c).toMatchObject({ level: 'street', building: null });
    // The code of no one building falls back to the Street.
    expect(
      camera({ ...startCamera({ level: 'code' }), scale: 0.65 }, { type: 'zoom', factor: 0.8 })
        .level,
    ).toBe('street');
  });

  it('goes into the address and comes back the same', () => {
    const c: Camera = {
      ...startCamera({ level: 'building', building: 'take-an-order' }),
      orientation: 'west',
      scale: 1.75,
      centre: { x: 0.3125, y: 0.6 },
    };
    const q = cameraQuery(c);
    expect(q).toEqual({ o: 'west', z: '1.75', cx: '0.313', cy: '0.6' });
    expect(cameraFrom(q, 'building', 'take-an-order')).toEqual({
      ...c,
      centre: { x: 0.313, y: 0.6 },
    });
    expect(cameraQuery(startCamera())).toEqual({});
    expect(cameraFrom({ o: 'up', z: 'x' }, 'street', null)).toEqual(startCamera());
    expect(cameraFrom({ z: '99' }, 'street', null).scale).toBe(4);
  });
});

describe('the Street in four orientations', () => {
  const frame = (o: (typeof ORIENTATIONS)[number]) => {
    const { ctx, rec } = recorder();
    drawStreet(ctx, {
      street: orientStreet(s, o),
      palette: pal,
      flags: {},
      selected: null,
      hover: null,
      image: () => ({}) as CanvasImageSource,
    });
    return rec;
  };

  it('gives the same frame for the same camera, and a different one from each side', () => {
    const frames = ORIENTATIONS.map((o) => JSON.stringify(frame(o)));
    expect(ORIENTATIONS.map((o) => JSON.stringify(frame(o)))).toEqual(frames);
    expect(orientStreet(s, 'north')).toBe(s);
    expect(
      new Set(
        ORIENTATIONS.map((o) =>
          JSON.stringify(orientStreet(s, o).buildings.map((b) => [b.gx, b.gy])),
        ),
      ).size,
    ).toBe(4);
    // Four quarter turns come back to the start.
    let t = s;
    for (let i = 0; i < 4; i++) t = orientStreet(t, 'east');
    expect(t.buildings.map((b) => [b.gx, b.gy])).toEqual(s.buildings.map((b) => [b.gx, b.gy]));
  });

  it('keeps everything on the ground it stood on, and every label upright', () => {
    for (const o of ORIENTATIONS) {
      const t = orientStreet(s, o);
      for (const b of t.buildings) {
        expect(b.gx, o).toBeGreaterThanOrEqual(t.ground.gx0 - 1e-9);
        expect(b.gy, o).toBeGreaterThanOrEqual(t.ground.gy0 - 1e-9);
      }
      // The picture holds every corner of every building.
      for (const b of t.buildings)
        for (const p of buildingFaces(t, b).outline) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(t.width);
          expect(p.y).toBeLessThanOrEqual(t.height);
        }
      // Labels are text drawn upright: the same names appear from every side.
      expect([...frame(o).texts].sort(), o).toEqual([...frame('north').texts].sort());
    }
  });

  it('sorts depth correctly from every side: a building in front is drawn after the one behind', () => {
    for (const o of ORIENTATIONS) {
      const t = orientStreet(s, o);
      const order = [...t.buildings].sort((x, y) => x.gx + x.gy + x.side - (y.gx + y.gy + y.side));
      // Whatever is drawn later never lies wholly behind what came before: its front corner is lower.
      for (let i = 1; i < order.length; i++) {
        const front = (b: (typeof order)[number]) =>
          Math.max(...buildingFaces(t, b).outline.map((p) => p.y));
        const a = order[i - 1]!;
        const b = order[i]!;
        const overlap = buildingFaces(t, a).outline.some((p) =>
          inPolygon(p, buildingFaces(t, b).outline),
        );
        if (overlap)
          expect(front(b), `${o}: ${a.id} then ${b.id}`).toBeGreaterThanOrEqual(front(a));
      }
    }
  });

  it('picks what is drawn from every side: buildings, facades, bricks and plots', () => {
    for (const o of ORIENTATIONS) {
      const t = orientStreet(s, o);
      const see = t.buildings.find((b) => b.id === 'see-orders')!;
      expect(pickStreet(t, mid(buildingFaces(t, see).left)), o).toEqual({
        kind: 'facade',
        building: 'see-orders',
        screen: '/',
      });
      const take = t.buildings.find((b) => b.id === 'take-an-order')!;
      const brick = take.floors[0]!.bricks[0]!;
      expect(
        pickStreet(t, mid(brickOnFace(buildingFaces(t, take).right, take.height, brick))),
        o,
      ).toEqual({
        kind: 'brick',
        building: 'take-an-order',
        path: brick.path,
      });
      for (const pl of t.plots) {
        const hit = pickStreet(t, mid(plotPolygon(t, pl)));
        if (hit?.kind === 'plot') expect(hit.table).toBe(pl.table);
      }
    }
  });
});

describe('a building in four orientations', () => {
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
    ],
  };
  const nodeOf = (p: string) => bp.nodes.find((n) => n.path === p)!;
  const sc = building(
    s.buildings.find((b) => b.id === 'see-orders')!,
    [facade],
    nodeOf,
    new Set(bp.screens.map((x) => x.file)),
  );

  it('carries the screens on whichever face is toward the camera, and picks there', () => {
    for (const o of ORIENTATIONS) {
      const t = orientScene(sc, o);
      expect(t.facadeFace, o).toBe(o === 'east' || o === 'west' ? 'right' : 'left');
      const g = t.facades[0]!.figures[0]!.at!;
      expect(pickBuilding(t, mid(facadeShape(t, g.u0, g.u1, g.v0, g.v1))), o).toEqual({
        kind: 'figure',
        screen: '/',
        key: '/~order-count',
        traced: true,
      });
      const brick = t.floors[0]!.bricks[0]!;
      expect(pickBuilding(t, mid(brickOnFace(floorFaceOf(t), t.h, brick))), o).toEqual({
        kind: 'brick',
        path: brick.path,
      });
      const { ctx, rec } = recorder();
      drawBuilding(ctx, {
        scene: t,
        palette: pal,
        flag: null,
        picked: null,
        hover: null,
        image: () => ({}) as CanvasImageSource,
      });
      const again = recorder();
      drawBuilding(again.ctx, {
        scene: orientScene(sc, o),
        palette: pal,
        flag: null,
        picked: null,
        hover: null,
        image: () => ({}) as CanvasImageSource,
      });
      expect(JSON.stringify(again.rec)).toBe(JSON.stringify(rec));
      // The screen reads left to right from every side: across the face runs rightwards in the picture.
      const face = facadeShape(t, 0, 1);
      expect(face[1]!.x, o).toBeGreaterThan(face[0]!.x);
      // The screen is painted once, the right way round: the picture is drawn, not mirrored text.
      expect(rec.images).toBe(1);
      expect(rec.texts).toContain('Today’s orders');
    }
  });
});
