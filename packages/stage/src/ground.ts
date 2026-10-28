// ground(table) → the ground opened (Stage 11): a plot of the Street is a real table, and it opens the way
// a building opens. The camera dives into the ground and the table fills the stage as a glass slab: its
// columns across the face toward the camera (name, then type and key), its rows down it, newest first;
// above it, a pipe up to each building that reads it or writes it. The same four orientations as every
// level: a quarter turn swaps the slab's sides and the table is painted on whichever face is toward the
// camera, the right way round, so no word is ever mirrored. Pure and deterministic; pick() reads a cell
// or a column back from a point of the picture, so what is clicked is exactly what was drawn.
import { ORIENTATIONS, type Orientation } from './camera.ts';
import { boxFaces, project, TILE_H, TILE_W, toFace, inPolygon, type Pt } from './iso.ts';
import { subFace } from './geometry.ts';

export interface GroundColumnInput {
  name: string;
  /** Its Drizzle type, as the definition writes it. */
  type: string;
  /** The primary key, or a pointer to another table. */
  key: 'primary' | 'link' | null;
  /** True when a figure on a screen is worked out from it: marked, and its flow is a click away. */
  figure: boolean;
  /** Its values are never shown. */
  masked: boolean;
}

export interface GroundInput {
  table: string;
  columns: GroundColumnInput[];
  /** The page of rows shown, as the table holds them; null is an empty value. */
  rows: (string | null)[][];
  /** Building names. */
  readBy: string[];
  writtenBy: string[];
  /** Why no row is shown, when none can be ("Rows not connected: …"); null when the rows are read. */
  note: string | null;
}

export interface GroundScene {
  table: string;
  orientation: Orientation;
  width: number;
  height: number;
  origin: Pt;
  /** Footprint (after the turn) in tiles, and height in pixels. */
  w: number;
  d: number;
  h: number;
  faces: { top: Pt[]; left: Pt[]; right: Pt[]; outline: Pt[] };
  /** The face toward the camera that carries the table. */
  tableFace: 'left' | 'right';
  /** The table on its face, in the face's own pixels: its length across and its height down. */
  faceLen: number;
  /** Each column's left edge and width across the face, in pixels. */
  cols: { x: number; w: number }[];
  /** How many rows of the page are drawn. */
  rows: number;
  /** Pipes up to the buildings that read and write the table, from the slab's top. */
  pipes: { kind: 'reads' | 'writes'; building: string; from: Pt; to: Pt }[];
  input: GroundInput;
}

export const G_HEADER = 52;
export const G_ROW = 24;
export const G_PAD = 14;
const MIN_ROWS = 3;
const DEPTH = 3;
const MARGIN = 60;
const PIPE = 64;
const HYP = Math.hypot(TILE_W / 2, TILE_H / 2);

/** The line under a column's name: its type, its key, and whether it is kept secret. */
export function columnKind(c: GroundColumnInput): string {
  return [
    c.type,
    c.key === 'primary' ? 'key' : c.key === 'link' ? 'points on' : '',
    c.masked ? 'kept secret' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A column's width on the slab: wide enough for its name, its kind and its longest value shown. */
export function columnWidth(c: GroundColumnInput, values: (string | null)[]): number {
  const chars = Math.max(
    c.name.length + 2,
    columnKind(c).length,
    ...values.map((v) => Math.min(28, (v ?? 'empty').length)),
  );
  return Math.round(Math.min(240, Math.max(96, chars * 7.4 + 24)));
}

export function ground(input: GroundInput, orientation: Orientation = 'north'): GroundScene {
  const widths = input.columns.map((c, i) =>
    columnWidth(
      c,
      input.rows.map((r) => (c.masked ? '••••' : (r[i] ?? null))),
    ),
  );
  const cols: { x: number; w: number }[] = [];
  let x = G_PAD;
  for (const w of widths) {
    cols.push({ x, w });
    x += w;
  }
  const wide = Math.max(4, Math.ceil((x + G_PAD) / HYP));
  const faceLen = wide * HYP;
  const rows = input.rows.length;
  const h = G_HEADER + Math.max(MIN_ROWS, rows) * G_ROW + G_PAD;
  // The turn: on an odd quarter the slab's sides swap, and the table goes on the other face toward us.
  const odd = ORIENTATIONS.indexOf(orientation) % 2 === 1;
  const w = odd ? DEPTH : wide;
  const d = odd ? wide : DEPTH;
  const pipes = [
    ...input.writtenBy.map((b) => ({ kind: 'writes' as const, building: b })),
    ...input.readBy.map((b) => ({ kind: 'reads' as const, building: b })),
  ];
  const top = h + PIPE + 26 * Math.max(1, pipes.length);
  const corners = [
    project(0, 0, top),
    project(w, 0, top),
    project(w, d),
    project(0, d),
    project(w, 0),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const origin = { x: Math.round(MARGIN - minX), y: Math.round(MARGIN - minY) };
  const at = (gx: number, gy: number, z: number) => {
    const p = project(gx, gy, z);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  return {
    table: input.table,
    orientation,
    width: Math.ceil(maxX - minX + MARGIN * 2),
    height: Math.ceil(maxY - minY + MARGIN * 2 + 40),
    origin,
    w,
    d,
    h,
    faces: boxFaces(0, 0, w, d, h, at),
    tableFace: odd ? 'right' : 'left',
    faceLen,
    cols,
    rows,
    // Each pipe rises from the slab's top along its length, one above the other's label.
    pipes: pipes.map((p, i) => {
      const t = (i + 0.5) / pipes.length;
      const from = odd ? at(DEPTH / 2, wide * (1 - t), h) : at(wide * t, DEPTH / 2, h);
      return { ...p, from, to: { x: from.x, y: from.y - PIPE - 26 * i } };
    }),
    input,
  };
}

/** The face that carries the table, given so that across it runs left to right in the picture. */
export function tableFaceOf(s: Pick<GroundScene, 'faces' | 'tableFace'>): Pt[] {
  if (s.tableFace !== 'right') return s.faces.left;
  const [b0, b1, t1, t0] = s.faces.right as [Pt, Pt, Pt, Pt];
  return [b1, b0, t0, t1];
}

/** A rectangle of the table (face pixels: x across, y down) as drawn on the face. */
export function onTable(s: GroundScene, x0: number, x1: number, y0: number, y1: number): Pt[] {
  return subFace(tableFaceOf(s), x0 / s.faceLen, x1 / s.faceLen, y0 / s.h, y1 / s.h);
}

export type GroundPick =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'column'; col: number }
  | { kind: 'pipe'; building: string }
  | { kind: 'slab' }
  | null;

/** What is under a point of the picture: a cell, a column's head, a pipe up to a building, the slab. */
export function pickGround(s: GroundScene, p: Pt): GroundPick {
  for (const q of s.pipes)
    if (Math.abs(p.x - q.to.x) < 8 && p.y >= q.to.y - 12 && p.y <= q.from.y)
      return { kind: 'pipe', building: q.building };
  const uv = toFace(tableFaceOf(s), p);
  if (uv) {
    const fx = uv.u * s.faceLen;
    const fy = uv.v * s.h;
    const col = s.cols.findIndex((c) => fx >= c.x && fx < c.x + c.w);
    if (col >= 0) {
      if (fy < G_HEADER) return { kind: 'column', col };
      const row = Math.floor((fy - G_HEADER) / G_ROW);
      if (row < s.rows) return { kind: 'cell', row, col };
    }
    return { kind: 'slab' };
  }
  return inPolygon(p, s.faces.outline) || inPolygon(p, s.faces.top) ? { kind: 'slab' } : null;
}

/** The middle of a cell (row −1: the column's head) in the picture, where a person clicks it. */
export function cellPoint(s: GroundScene, row: number, col: number): Pt {
  const c = s.cols[col]!;
  const y0 = row < 0 ? 0 : G_HEADER + row * G_ROW;
  const y1 = row < 0 ? G_HEADER : y0 + G_ROW;
  const q = onTable(s, c.x, c.x + c.w, y0, y1);
  return { x: (q[0]!.x + q[2]!.x) / 2, y: (q[0]!.y + q[2]!.y) / 2 };
}
