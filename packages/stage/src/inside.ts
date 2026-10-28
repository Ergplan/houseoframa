// inside(building) → the third level (Stage 11): the same glass building seen from inside, under the same
// camera. Its floors (what it remembers, decides, who it talks to, what it shows) are slabs one above the
// other; each brick is a transparent block standing on its floor, its height by its lines, laid in build
// order (the lift that laid it, then by name), so a replay fills the floors in the order they were built.
// A quarter turn turns the world before it is projected, as on the Street, so drawing and picking are the
// same code from every side. Pure and deterministic. It replaces the Stage 2 brick building, so every
// file it showed stands inside some building: the files the Street does not draw (its checks, and the
// papers: documents, settings, pictures) stand on two lower floors, a check in the building of the code
// it checks, everything else behind the screens.
import type { Blueprint, BrickNode } from '@rama/shared';
import type { Orientation } from './camera.ts';
import { ORIENTATIONS } from './camera.ts';
import { onStreet } from './features.ts';
import { boxFaces, inPolygon, project, type Pt } from './iso.ts';
import { FLOOR_LABEL, FLOOR_ORDER, floorOf, type StreetBuilding } from './street.ts';

/** The floors inside, bottom to top: the papers and the checks under the Street's four. */
export type InsideFloorKind = 'papers' | 'checks' | (typeof FLOOR_ORDER)[number];
export const INSIDE_ORDER: readonly InsideFloorKind[] = ['papers', 'checks', ...FLOOR_ORDER];
export const INSIDE_LABEL: Record<InsideFloorKind, string> = {
  papers: 'Its papers',
  checks: 'How it is checked',
  ...FLOOR_LABEL,
};

/** The floor a file stands on inside. */
export function insideFloorOf(
  node: BrickNode,
  screenFiles: ReadonlySet<string>,
  drawn: (path: string) => boolean,
): InsideFloorKind {
  if (node.test) return 'checks';
  if (!drawn(node.path)) return 'papers';
  return floorOf(node, screenFiles);
}

/**
 * The files inside each building: its own, then each file the Street does not draw. A check stands in
 * the building of the first file it imports that stands in one; anything else behind the screens (or in
 * the last building when there is no such building).
 */
export function insideFiles(
  bp: Pick<Blueprint, 'nodes' | 'edges'>,
  buildings: Pick<StreetBuilding, 'id' | 'bricks'>[],
): Map<string, string[]> {
  const out = new Map(buildings.map((b) => [b.id, [...b.bricks]]));
  const owner = new Map(buildings.flatMap((b) => b.bricks.map((p) => [p, b.id] as const)));
  const rest = buildings.find((b) => b.id === 'behind')?.id ?? buildings.at(-1)?.id;
  if (!rest) return out;
  for (const n of bp.nodes) {
    if (owner.has(n.path)) continue;
    const to = n.test
      ? bp.edges.filter((e) => e.from === n.path).find((e) => owner.has(e.to))?.to
      : undefined;
    out.get(to ? owner.get(to)! : rest)!.push(n.path);
  }
  return out;
}

export interface InsideBrick {
  path: string;
  floor: InsideFloorKind;
  /** Footprint on the floor, in tiles (after the turn), square. */
  gx: number;
  gy: number;
  side: number;
  /** Standing from z0 (its floor) to z1, in pixels. */
  z0: number;
  z1: number;
  lines: number;
  /** Its place in build order across the building, from 0. */
  order: number;
  /** The 0-based lift that laid it; -1 when it is not in the history. */
  laidIn: number;
}

export interface InsideFloor {
  kind: InsideFloorKind;
  label: string;
  z0: number;
  z1: number;
  count: number;
}

export interface InsideScene {
  id: string;
  name: string;
  orientation: Orientation;
  width: number;
  height: number;
  origin: Pt;
  /** Footprint (after the turn) in tiles, and the height of the floors in pixels. */
  w: number;
  d: number;
  h: number;
  floors: InsideFloor[];
  /** In drawing order: lower floors first, then far to near; a later brick stands in front. */
  bricks: InsideBrick[];
}

export const IN_CELL = 1;
export const IN_SIDE = 0.62;
export const IN_MIN_BRICK = 8;
// Never more than a diagonal step (TILE_H) taller than the smallest, so the brick in front on the same
// floor never hides one behind it: some of every brick shows.
export const IN_MAX_BRICK = 36;
export const IN_FLOOR_PAD = 26;
const MIN_W = 6;
const MIN_D = 5;
const MARGIN = 60;
/** Room left of the floors for their names. */
const LABELS = 190;

/** A brick's height by its lines: taller for longer files, never lost, never a tower. */
export function brickHeight(lines: number, binary = false): number {
  if (binary) return IN_MIN_BRICK;
  return Math.round(Math.min(IN_MAX_BRICK, IN_MIN_BRICK + Math.sqrt(Math.max(0, lines)) * 1.4));
}

/**
 * The inside of a building. `laidIn` gives the 0-based lift that laid each file (-1 when the history does
 * not hold it), from the Blueprint's commits; the bricks are laid in that order on each floor.
 */
export function inside(
  b: Pick<StreetBuilding, 'id' | 'name' | 'bricks'>,
  nodeOf: (path: string) => BrickNode,
  screenFiles: ReadonlySet<string>,
  laidIn: (path: string) => number,
  orientation: Orientation = 'north',
  /** Whether the Street draws a file; the files it does not stand on the papers' and checks' floors. */
  drawn: (path: string) => boolean = () => true,
): InsideScene {
  const by = new Map<InsideFloorKind, string[]>();
  for (const p of b.bricks) {
    const k = insideFloorOf(nodeOf(p), screenFiles, drawn);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const lifted = (p: string) => {
    const l = laidIn(p);
    return l < 0 ? Number.MAX_SAFE_INTEGER : l;
  };
  for (const list of by.values()) list.sort((x, y) => lifted(x) - lifted(y) || (x < y ? -1 : 1));
  const most = Math.max(1, ...[...by.values()].map((l) => l.length));
  // A footprint wide enough for the fullest floor, about square, never smaller than the building's.
  const W = Math.max(MIN_W, Math.ceil(Math.sqrt(most)));
  const D = Math.max(MIN_D, Math.ceil(most / W));
  const floors: InsideFloor[] = [];
  const bricks: InsideBrick[] = [];
  let z = 0;
  let order = 0;
  for (const kind of INSIDE_ORDER) {
    const paths = by.get(kind);
    if (!paths?.length) continue;
    const tall = Math.max(...paths.map((p) => brickHeight(nodeOf(p).lines, nodeOf(p).binary)));
    const z1 = z + tall + IN_FLOOR_PAD;
    paths.forEach((path, i) => {
      const n = nodeOf(path);
      bricks.push({
        path,
        floor: kind,
        gx: (i % W) * IN_CELL + (IN_CELL - IN_SIDE) / 2,
        gy: Math.floor(i / W) * IN_CELL + (IN_CELL - IN_SIDE) / 2,
        side: IN_SIDE,
        z0: z,
        z1: z + brickHeight(n.lines, n.binary),
        lines: n.lines,
        order: order++,
        laidIn: laidIn(path),
      });
    });
    floors.push({ kind, label: INSIDE_LABEL[kind], z0: z, z1, count: paths.length });
    z = z1;
  }
  // The turn: one quarter right takes (gx, gy) on a floor W wide and D deep to (D − gy − side, gx).
  let w = W;
  let d = D;
  let turned = bricks;
  for (let i = 0; i < ORIENTATIONS.indexOf(orientation); i++) {
    const Y = d;
    turned = turned.map((x) => ({ ...x, gx: Y - x.gy - x.side, gy: x.gx }));
    [w, d] = [d, w];
  }
  const h = Math.max(z, 1);
  turned = [...turned].sort((x, y) => x.z0 - y.z0 || x.gx + x.gy - (y.gx + y.gy) || x.gx - y.gx);
  const corners = [project(0, 0, h + 70), project(w, 0, h + 70), project(w, d), project(0, d)];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  return {
    id: b.id,
    name: b.name,
    orientation,
    width: Math.ceil(maxX - minX + MARGIN * 2 + LABELS),
    height: Math.ceil(maxY - minY + MARGIN * 2),
    origin: { x: Math.round(MARGIN + LABELS - minX), y: Math.round(MARGIN - minY) },
    w,
    d,
    h,
    floors,
    bricks: turned,
  };
}

/** A world point of the inside to the picture. */
export function insideAt(s: Pick<InsideScene, 'origin'>) {
  return (gx: number, gy: number, z = 0): Pt => {
    const p = project(gx, gy, z);
    return { x: p.x + s.origin.x, y: p.y + s.origin.y };
  };
}

/** A brick's three faces as drawn. */
export function insideBrickFaces(s: InsideScene, x: InsideBrick) {
  const a = insideAt(s);
  return boxFaces(x.gx, x.gy, x.side, x.side, x.z1 - x.z0, (gx, gy, zz) => a(gx, gy, zz + x.z0));
}

/** A floor's slab: its outline at its own height. */
export function floorSlab(s: InsideScene, f: Pick<InsideFloor, 'z0'>): Pt[] {
  const a = insideAt(s);
  return [a(0, 0, f.z0), a(s.w, 0, f.z0), a(s.w, s.d, f.z0), a(0, s.d, f.z0)];
}

/** The middle of a brick's top: where pipes and cables join it. */
export function brickTop(s: InsideScene, x: InsideBrick): Pt {
  return insideAt(s)(x.gx + x.side / 2, x.gy + x.side / 2, x.z1);
}

export type InsidePick =
  { kind: 'brick'; path: string } | { kind: 'floor'; floor: InsideFloorKind } | null;

/**
 * What is under a point of the picture: the front-most brick, else the floor it stands over. With a
 * floor chosen, only that floor's bricks are picked (the floors above it no longer stand in the way).
 */
export function pickInside(
  s: InsideScene,
  p: Pt,
  floor: InsideFloorKind | null = null,
): InsidePick {
  for (let i = s.bricks.length - 1; i >= 0; i--) {
    const x = s.bricks[i]!;
    if (floor && x.floor !== floor) continue;
    const f = insideBrickFaces(s, x);
    if (inPolygon(p, f.outline) || inPolygon(p, f.top)) return { kind: 'brick', path: x.path };
  }
  for (let i = s.floors.length - 1; i >= 0; i--)
    if (inPolygon(p, floorSlab(s, s.floors[i]!)))
      return { kind: 'floor', floor: s.floors[i]!.kind };
  return null;
}

/** Whether a brick stands at a moment of the replay: laid by lift k (1-based; 0 is before any lift). */
export function standsAt(x: Pick<InsideBrick, 'laidIn'>, k: number, lifts: number): boolean {
  return x.laidIn < 0 ? k >= lifts : x.laidIn < k;
}

/** Whether the Street draws a file (code, not a test), for `inside`'s `drawn`. */
export const drawnOn = (bp: Blueprint) => {
  const yes = new Set(bp.nodes.filter((n) => onStreet(bp, n.path)).map((n) => n.path));
  return (path: string) => yes.has(path);
};

/** The 0-based lift that laid each file: its first commit's place in the history, -1 when it has none. */
export function laidInOf(bp: {
  commits: { sha: string }[];
  nodes: { path: string; firstCommit: string }[];
}): Map<string, number> {
  const index = new Map(bp.commits.map((c, i) => [c.sha, i]));
  return new Map(bp.nodes.map((n) => [n.path, index.get(n.firstCommit) ?? -1]));
}

/**
 * Where a brick can be clicked: a point of it that the pick gives back with its floor chosen, scanning
 * its outline; null when none shows. The walk test and the browser tests click here.
 */
export function pointOf(s: InsideScene, path: string): Pt | null {
  const x = s.bricks.find((b) => b.path === path);
  if (!x) return null;
  const f = insideBrickFaces(s, x);
  const xs = f.outline.map((q) => q.x);
  const ys = f.outline.map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let b = 0; b <= 8; b++)
    for (let a = 0; a <= 8; a++) {
      const q = { x: x0 + ((x1 - x0) * a) / 8, y: y0 + ((y1 - y0) * b) / 8 };
      if (!inPolygon(q, f.outline)) continue;
      const hit = pickInside(s, q, x.floor);
      if (hit?.kind === 'brick' && hit.path === path) return q;
    }
  return null;
}

/** Every building's inside, from one side, as the site's page lays them (street, then insideFiles). */
export function insidesOf(
  bp: Blueprint,
  buildings: Pick<StreetBuilding, 'id' | 'name' | 'bricks'>[],
  orientation: Orientation = 'north',
): InsideScene[] {
  const nodes = new Map(bp.nodes.map((n) => [n.path, n]));
  const screens = new Set(bp.screens.map((s) => s.file));
  const laid = laidInOf(bp);
  const files = insideFiles(bp, buildings);
  const drawn = drawnOn(bp);
  return buildings.map((b) =>
    inside(
      { ...b, bricks: files.get(b.id)! },
      (p) => nodes.get(p)!,
      screens,
      (p) => laid.get(p) ?? -1,
      orientation,
      drawn,
    ),
  );
}
