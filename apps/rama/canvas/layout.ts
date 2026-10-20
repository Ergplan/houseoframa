// layout(blueprint) → where everything stands: floors (layers, bottom to top), bricks (files, width
// log-scaled by lines), scaffolds (branches), cranes (authors), the Showroom door and the site office.
// A pure, deterministic function: the same Blueprint always gives the same scene, to the pixel.
// Ported from the weekend prototype (reference/weekend-prototype/house-of-rama.html, "building
// layout"); the fixed 440px building is replaced by a width that grows with the number of bricks.
import type { Blueprint } from '@rama/shared';
import { authors, brickFigures } from '@rama/blueprint/metrics';
import { CRANE_COLORS, layerColor, layerShort } from './palette.ts';

export const BRICK_H = 14;
export const GAP = 3;
export const FLOOR_PAD = 8;
export const PLATE = 6;
export const MIN_BUILDING_W = 440;
export const MAX_BUILDING_W = 2400;
export const MAX_CRANES = 6;
export const MAX_SCAFFOLDS = 6;
const LEFT = 300; // the site sign and the floor labels
const SKY = 240; // cranes, their name boards and the banners stand above the building
const SCAFFOLD_W = 34;
const OFFICE_W = 140;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrickBox extends Box {
  path: string;
  layer: string;
  color: string;
  /** Red marker: code with no test importing it. */
  untested: boolean;
  binary: boolean;
}

export interface FloorBox {
  id: string;
  label: string;
  short: string;
  color: string;
  y: number;
  h: number;
  /** Paths on this floor, in drawing order. */
  paths: string[];
}

export interface Crane {
  author: string;
  label: string;
  x: number;
  color: string;
  /** The jib points toward the middle of the building. */
  jib: 'left' | 'right';
}

export interface Scaffold extends Box {
  branch: string;
}

export interface Scene {
  width: number;
  height: number;
  ground: number;
  /** Top of the highest floor plate. */
  top: number;
  building: Box;
  floors: FloorBox[];
  bricks: BrickBox[];
  byPath: Map<string, BrickBox>;
  cranes: Crane[];
  scaffolds: Scaffold[];
  /** Branches beyond MAX_SCAFFOLDS, named on the last board. */
  moreBranches: number;
  door: Box;
  office: Box;
  sign: Box;
}

/** Width of a brick: log-scaled by lines so a lockfile does not eat a floor. */
export const brickWidth = (lines: number) =>
  Math.max(18, Math.min(150, Math.round(14 + Math.log2(1 + lines) * 9)));

/** Building width: wide enough that the building is roughly as tall as it is wide, within bounds. */
export function buildingWidth(widths: number[]): number {
  const area = widths.reduce((s, w) => s + (w + GAP) * (BRICK_H + GAP), 0);
  const w = Math.ceil(Math.sqrt(area / 0.55) / 20) * 20;
  return Math.max(MIN_BUILDING_W, Math.min(MAX_BUILDING_W, w));
}

export function layout(bp: Blueprint): Scene {
  const figures = brickFigures(bp);
  const order = bp.layers.map((l) => l.id);
  const extraLayers = [...new Set(bp.nodes.map((n) => n.layer))]
    .filter((id) => !order.includes(id))
    .sort();
  const layers = [...bp.layers, ...extraLayers.map((id) => ({ id, label: id }))];
  const nodes = [...bp.nodes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bw = buildingWidth(nodes.map((n) => brickWidth(n.lines)));
  const bx = LEFT;
  const inner = bw - 16;

  // First pass: rows per floor, bottom to top, measured from y = 0 upward.
  type Row = { path: string; w: number; rx: number }[];
  const planned = layers
    .map((l) => {
      const items = nodes.filter((n) => n.layer === l.id);
      const rows: Row[] = [];
      let row: Row = [];
      let x = 0;
      for (const n of items) {
        const w = brickWidth(n.lines);
        if (x + w > inner && row.length) {
          rows.push(row);
          row = [];
          x = 0;
        }
        row.push({ path: n.path, w, rx: x });
        x += w + GAP;
      }
      if (row.length) rows.push(row);
      return { layer: l, rows, h: rows.length * (BRICK_H + GAP) + FLOOR_PAD * 2 };
    })
    .filter((f) => f.rows.length > 0);

  const height = planned.reduce((s, f) => s + f.h + PLATE, 0);
  const ground = SKY + height;
  const floors: FloorBox[] = [];
  const bricks: BrickBox[] = [];
  const byNode = new Map(bp.nodes.map((n) => [n.path, n]));
  let y = ground;
  for (const f of planned) {
    y -= f.h;
    const color = layerColor(f.layer.id);
    f.rows.forEach((r, ri) => {
      const used = r.reduce((s, b) => s + b.w + GAP, 0) - GAP;
      const off = Math.round((inner - used) / 2) + 8;
      for (const b of r) {
        const n = byNode.get(b.path)!;
        bricks.push({
          path: b.path,
          layer: f.layer.id,
          color,
          x: bx + off + b.rx,
          y: y + FLOOR_PAD + ri * (BRICK_H + GAP),
          w: b.w,
          h: BRICK_H,
          untested: figures[b.path]?.tested === false,
          binary: n.binary,
        });
      }
    });
    floors.push({
      id: f.layer.id,
      label: f.layer.label,
      short: layerShort(f.layer.label, f.layer.id),
      color,
      y,
      h: f.h,
      paths: f.rows.flat().map((b) => b.path),
    });
    y -= PLATE;
  }
  const top = y;

  // Cranes: one per builder, in order of their first commit; the rest share the last crane.
  const firstSeen = new Map<string, number>();
  bp.commits.forEach((c, i) => firstSeen.has(c.author) || firstSeen.set(c.author, i));
  const builders = authors(bp).sort((a, b) => firstSeen.get(a)! - firstSeen.get(b)!);
  const shown = builders.length > MAX_CRANES ? builders.slice(0, MAX_CRANES - 1) : builders;
  const rest = builders.length - shown.length;
  const craneCount = shown.length + (rest ? 1 : 0);
  const cranes: Crane[] = [];
  for (let i = 0; i < craneCount; i++) {
    const x = Math.round(bx + (bw * (i + 1)) / (craneCount + 1));
    const author = i < shown.length ? shown[i]! : `+${rest} more`;
    cranes.push({
      author,
      label: author.toUpperCase().slice(0, 14),
      x,
      color: CRANE_COLORS[i % CRANE_COLORS.length]!,
      jib: x < bx + bw / 2 ? 'right' : 'left',
    });
  }

  const branchList = bp.branches.slice(0, MAX_SCAFFOLDS);
  const scaffolds = branchList.map((branch, i) => ({
    branch,
    x: bx + bw + 6 + i * SCAFFOLD_W,
    y: top - 26,
    w: 26,
    h: ground - (top - 26),
  }));
  const officeX = bx + bw + 6 + Math.max(1, branchList.length) * SCAFFOLD_W + 40;

  return {
    width: officeX + OFFICE_W + 24,
    height: ground + 60,
    ground,
    top,
    building: { x: bx, y: top, w: bw, h: ground - top },
    floors,
    bricks,
    byPath: new Map(bricks.map((b) => [b.path, b])),
    cranes,
    scaffolds,
    moreBranches: bp.branches.length - branchList.length,
    door: { x: bx + bw / 2 - 26, y: ground - 46, w: 52, h: 46 },
    office: { x: officeX, y: ground - 84, w: OFFICE_W, h: 84 },
    sign: { x: 14, y: ground - 160, w: 146, h: 78 },
  };
}
