// The camera (Stage 11): one state object, {level, orientation, scale, centre}, that every draw takes.
// The isometric grid turns in quarter steps only (north, east, south, west), so lines stay crisp and
// the picture stays honest about depth; free rotation is not offered. Zoom is continuous within a level
// and hands off between the three levels: far enough into a building and the Building level opens, far
// enough into a floor and the code opens; out again and the levels fall back. Pure and deterministic:
// the same Blueprint, features and camera give the same frame.
import { project, type Pt } from './iso.ts';
import type { BuildingScene } from './building.ts';
import { boxFaces } from './iso.ts';
import type { Street } from './street.ts';

export const ORIENTATIONS = ['north', 'east', 'south', 'west'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];
/** The Street, a building, the inside of one (`code`), or a table of the ground opened (Stage 11). */
export type Level = 'street' | 'building' | 'code' | 'ground';

export interface Camera {
  level: Level;
  /** The building the Building level and the code are of. */
  building: string | null;
  /** The table the ground level is of. */
  table?: string | null;
  orientation: Orientation;
  /** 1 is the whole picture in view; more is closer. */
  scale: number;
  /** The point of the picture at the middle of the view, as a fraction of its width and height. */
  centre: { x: number; y: number };
}

/** Within a level the scale runs between these; past them the level hands off. */
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 4;
/** Closer than this onto a building opens it; further than MIN_SCALE falls back a level. */
export const HAND_OFF = 3.2;

export const startCamera = (over: Partial<Camera> = {}): Camera => ({
  level: 'street',
  building: null,
  orientation: 'north',
  scale: 1,
  centre: { x: 0.5, y: 0.5 },
  ...over,
});

export type CameraAction =
  | { type: 'turn'; by: 'left' | 'right' | 'around' }
  | {
      type: 'zoom';
      /** Multiplied into the scale: 1.25 is closer, 0.8 further. */
      factor: number;
      /** Where the pointer is in the view (fractions of its width and height), kept still while zooming. */
      at?: { x: number; y: number };
      /** What is under that point: zooming close onto a building, a floor or a plot hands off to it. */
      over?: { building: string } | { table: string } | null;
    }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'open'; level: Level; building?: string | null; table?: string | null }
  | { type: 'reset' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const turnBy = { right: 1, around: 2, left: 3 } as const;

/** The next camera after one action. */
export function camera(c: Camera, a: CameraAction): Camera {
  switch (a.type) {
    case 'turn': {
      const i = ORIENTATIONS.indexOf(c.orientation);
      return { ...c, orientation: ORIENTATIONS[(i + turnBy[a.by]) % 4]! };
    }
    case 'pan':
      return {
        ...c,
        centre: { x: clamp(c.centre.x + a.dx, 0, 1), y: clamp(c.centre.y + a.dy, 0, 1) },
      };
    case 'reset':
      return { ...c, scale: 1, centre: { x: 0.5, y: 0.5 } };
    case 'open':
      return {
        ...c,
        level: a.level,
        building:
          a.level === 'ground' ? null : (a.building ?? (a.level === 'street' ? null : c.building)),
        table: a.level === 'ground' ? (a.table ?? c.table ?? null) : null,
        scale: 1,
        centre: { x: 0.5, y: 0.5 },
      };
    case 'zoom': {
      const scale = c.scale * a.factor;
      // Closer than the hand-off over a building: the next level down opens, whole.
      if (scale >= HAND_OFF && a.factor > 1) {
        if (c.level === 'street' && a.over && 'building' in a.over)
          return {
            ...c,
            level: 'building',
            building: a.over.building,
            scale: 1,
            centre: { x: 0.5, y: 0.5 },
          };
        // Onto a plot: the camera dives into the ground and the table opens.
        if (c.level === 'street' && a.over && 'table' in a.over)
          return {
            ...c,
            level: 'ground',
            building: null,
            table: a.over.table,
            scale: 1,
            centre: { x: 0.5, y: 0.5 },
          };
        if (c.level === 'building' && c.building)
          return { ...c, level: 'code', scale: 1, centre: { x: 0.5, y: 0.5 } };
      }
      // Further than the whole picture: the level falls back.
      if (scale < MIN_SCALE && a.factor < 1) {
        if (c.level === 'code')
          return {
            ...c,
            level: c.building ? 'building' : 'street',
            scale: 1,
            centre: { x: 0.5, y: 0.5 },
          };
        if (c.level === 'building' || c.level === 'ground')
          return {
            ...c,
            level: 'street',
            building: null,
            table: null,
            scale: 1,
            centre: { x: 0.5, y: 0.5 },
          };
      }
      const next = clamp(scale, MIN_SCALE, MAX_SCALE);
      // Keep the point under the pointer where it is. The pointer is a fraction of the view; the
      // picture point under it goes through the camera as it is now (reviewer run 7).
      const at = a.at ?? { x: 0.5, y: 0.5 };
      const px = c.centre.x + (at.x - 0.5) / c.scale;
      const py = c.centre.y + (at.y - 0.5) / c.scale;
      return {
        ...c,
        scale: next,
        centre: {
          x: clamp(px - (at.x - 0.5) / next, 0, 1),
          y: clamp(py - (at.y - 0.5) / next, 0, 1),
        },
      };
    }
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The camera in the address (`o`, `z`, `cx`, `cy`; the level and building are the page's own). */
export function cameraQuery(c: Camera): Record<string, string> {
  const q: Record<string, string> = {};
  if (c.orientation !== 'north') q.o = c.orientation;
  if (c.scale !== 1) q.z = String(round(c.scale));
  if (c.centre.x !== 0.5 || c.centre.y !== 0.5) {
    q.cx = String(round(c.centre.x));
    q.cy = String(round(c.centre.y));
  }
  return q;
}

/** The camera from the address; anything it cannot read is left at its start. */
export function cameraFrom(
  q: Record<string, string | string[] | undefined>,
  level: Level,
  building: string | null,
): Camera {
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const num = (k: string, lo: number, hi: number, d: number) => {
    const v = Number(one(k));
    return one(k) !== undefined && Number.isFinite(v) ? clamp(v, lo, hi) : d;
  };
  const o = one('o');
  return {
    level,
    building,
    orientation: (ORIENTATIONS as readonly string[]).includes(o ?? '')
      ? (o as Orientation)
      : 'north',
    scale: num('z', MIN_SCALE, MAX_SCALE, 1),
    centre: { x: num('cx', 0, 1, 0.5), y: num('cy', 0, 1, 0.5) },
  };
}

/** How the view is placed on the picture: the canvas transform for the camera's scale and centre. */
export function viewTransform(
  c: Pick<Camera, 'scale' | 'centre'>,
  size: { width: number; height: number },
): { scale: number; dx: number; dy: number } {
  return {
    scale: c.scale,
    dx: size.width / 2 - c.centre.x * size.width * c.scale,
    dy: size.height / 2 - c.centre.y * size.height * c.scale,
  };
}

/** A point on the canvas (picture pixels of the view) back to the picture under the camera. */
export function unview(
  p: Pt,
  c: Pick<Camera, 'scale' | 'centre'>,
  size: { width: number; height: number },
): Pt {
  const t = viewTransform(c, size);
  return { x: (p.x - t.dx) / t.scale, y: (p.y - t.dy) / t.scale };
}

// ---- Quarter turns of the Street: the world's coordinates turned before they are projected, so the
// drawing and the picking need no change. One turn right takes (gx, gy) on a ground X wide and Y deep
// to (Y − gy, gx), on a ground Y wide and X deep.

type Rect = { gx: number; gy: number; w: number; d: number };
const turnPoint = (Y: number) => (p: { gx: number; gy: number }) => ({ gx: Y - p.gy, gy: p.gx });
const turnRect =
  (Y: number) =>
  (r: Rect): Rect => ({ gx: Y - r.gy - r.d, gy: r.gx, w: r.d, d: r.w });

function turnStreetOnce(s: Street): Street {
  const Y = s.extent.d;
  const pt = turnPoint(Y);
  const rect = turnRect(Y);
  const extent = { gx: 0, gy: 0, w: s.extent.w, d: s.extent.d };
  const area = (a: { gx0: number; gy0: number; gx1: number; gy1: number }) => {
    const r = rect({ gx: a.gx0, gy: a.gy0, w: a.gx1 - a.gx0, d: a.gy1 - a.gy0 });
    return { gx0: r.gx, gy0: r.gy, gx1: r.gx + r.w, gy1: r.gy + r.d };
  };
  const turned = rect(extent);
  return {
    ...s,
    buildings: s.buildings.map((b) => {
      const r = rect({ gx: b.gx, gy: b.gy, w: b.side, d: b.side });
      return { ...b, gx: r.gx, gy: r.gy };
    }),
    plots: s.plots.map((p) => ({ ...p, ...rect(p) })),
    roads: s.roads.map((r) => ({ ...r, points: r.points.map(pt) })),
    jetties: s.jetties.map((j) => ({ ...j, pier: area(j.pier), landing: area(j.landing) })),
    ground: area(s.ground),
    lake: area(s.lake),
    bank: area(s.bank),
    extent: { w: turned.w, d: turned.d },
  };
}

const MARGIN = 60;
const SKY = 120;

/** The Street seen from one of the four sides, its picture bounds measured again. */
export function orientStreet(s: Street, o: Orientation): Street {
  let t = s;
  for (let i = 0; i < ORIENTATIONS.indexOf(o); i++) t = turnStreetOnce(t);
  if (t === s) return s;
  const { w, d } = t.extent;
  const corners = [
    project(0, 0, SKY / 3),
    project(w, 0, SKY / 3),
    project(0, d, SKY / 3),
    project(w, d),
    project(w, 0),
    project(0, d),
    project(0, 0),
    ...t.buildings.flatMap((b) => [
      project(b.gx, b.gy, b.height + 70),
      project(b.gx + b.side, b.gy, b.height + 70),
      project(b.gx, b.gy + b.side, b.height + 70),
    ]),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  return {
    ...t,
    width: Math.ceil(maxX - minX + MARGIN * 2),
    height: Math.ceil(maxY - minY + MARGIN * 2),
    origin: { x: Math.round(MARGIN - minX), y: Math.round(MARGIN - minY) },
  };
}

/**
 * The building seen from one of the four sides. Its front and back are glass over the real screens,
 * its two sides show the floors; whichever face is toward the camera carries the screens, drawn the
 * right way round, so no picture and no word is ever mirrored.
 */
export function orientScene(sc: BuildingScene, o: Orientation): BuildingScene {
  const odd = ORIENTATIONS.indexOf(o) % 2 === 1;
  if (!odd) return { ...sc, facadeFace: 'left' };
  const W = sc.d;
  const D = sc.w;
  const corners = [
    project(0, 0, sc.h + 70),
    project(W, 0, sc.h + 70),
    project(W, D),
    project(0, D),
    project(W, 0),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const origin = { x: Math.round(sc.labels + MARGIN - minX), y: Math.round(MARGIN - minY) };
  const atPt = (gx: number, gy: number, z: number) => {
    const p = project(gx, gy, z);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  return {
    ...sc,
    origin,
    width: Math.ceil(maxX - minX + MARGIN * 2 + sc.labels),
    height: Math.ceil(maxY - minY + MARGIN * 2),
    w: W,
    d: D,
    faces: boxFaces(0, 0, W, D, sc.h, atPt),
    facadeFace: 'right',
  };
}
