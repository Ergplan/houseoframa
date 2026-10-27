// pick(): what lies under a point of the picture, front to back, at the Street and Building levels. The
// third level, the code, is the Brick canvas (apps/rama/canvas/pick.ts).
import type { BuildingScene } from './building.ts';
import { standingHeight } from './draw.ts';
import {
  brickOnFace,
  buildingFaces,
  facadeShape,
  floorFaceOf,
  jettyShapes,
  plotPolygon,
} from './geometry.ts';
import { inPolygon, type Pt } from './iso.ts';
import { laid, type StreetTimeline } from './replay.ts';
import type { Street } from './street.ts';

export type StreetPick =
  | { kind: 'facade'; building: string; screen: string }
  | { kind: 'brick'; building: string; path: string }
  | { kind: 'building'; building: string }
  | { kind: 'jetty'; service: string }
  | { kind: 'plot'; table: string }
  | null;

export function pickStreet(
  s: Street,
  p: Pt,
  replay: { timeline: StreetTimeline; k: number; p: number } | null = null,
): StreetPick {
  const order = [...s.buildings].sort((x, y) => y.gx + y.gy + y.side - (x.gx + x.gy + x.side));
  for (const b of order) {
    const h = standingHeight(b, { replay });
    if (h <= 0) continue;
    const f = buildingFaces(s, b, h);
    if (inPolygon(p, f.left) && b.facades.length) {
      return { kind: 'facade', building: b.id, screen: b.facades[0]!.screen };
    }
    if (inPolygon(p, f.right)) {
      for (const fl of b.floors)
        for (const x of fl.bricks) {
          if (x.z1 > h) continue;
          if (replay && laid(replay.timeline, x.path, replay.k, replay.p) === 'none') continue;
          if (inPolygon(p, brickOnFace(f.right, h, x)))
            return { kind: 'brick', building: b.id, path: x.path };
        }
    }
    if (inPolygon(p, f.outline)) return { kind: 'building', building: b.id };
  }
  for (const j of s.jetties) {
    const { pier, landing } = jettyShapes(s, j);
    if (inPolygon(p, pier) || inPolygon(p, landing.outline))
      return { kind: 'jetty', service: j.service };
  }
  for (const pl of s.plots)
    if (inPolygon(p, plotPolygon(s, pl))) return { kind: 'plot', table: pl.table };
  return null;
}

export type BuildingPick =
  | { kind: 'figure'; screen: string; key: string; traced: boolean }
  | { kind: 'facade'; screen: string }
  | { kind: 'brick'; path: string }
  | null;

export function pickBuilding(sc: BuildingScene, p: Pt): BuildingPick {
  for (const panel of sc.facades) {
    for (const g of panel.figures) {
      if (g.at && inPolygon(p, facadeShape(sc, g.at.u0, g.at.u1, g.at.v0, g.at.v1)))
        return { kind: 'figure', screen: panel.screen, key: g.key, traced: g.traced };
    }
    if (inPolygon(p, facadeShape(sc, panel.u0, panel.u1)))
      return { kind: 'facade', screen: panel.screen };
  }
  for (const fl of sc.floors)
    for (const x of fl.bricks)
      if (inPolygon(p, brickOnFace(floorFaceOf(sc), sc.h, x)))
        return { kind: 'brick', path: x.path };
  return null;
}

/** A pointer position on the (CSS-scaled) canvas element to picture coordinates. */
export function toPicture(
  rect: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number },
  clientX: number,
  clientY: number,
): Pt {
  return {
    x: ((clientX - rect.left) * size.width) / rect.width,
    y: ((clientY - rect.top) * size.height) / rect.height,
  };
}
