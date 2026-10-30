// The film's picture (Stage 13): the product's Street drawn as glass, filling as it is built. One frame
// says what stands so far (the files laid, the one being written, the tables lit and their row counts),
// where the builder stands, and which pipes carry a number; the drawing is the same every time for the
// same frame (deterministic) and turns in quarter steps with the camera, like the rest of the lakefront.
// Drawn only with Harmony's tokens (the Palette). The reference is design/film/index.html.
import type { Palette } from './palette.ts';
import { boxFaces, inPolygon, type Pt } from './iso.ts';
import {
  at,
  FLOOR_LABEL,
  FLOOR_ORDER,
  type FloorKind,
  type Street,
  type StreetBuilding,
} from './street.ts';

export interface FilmPipe {
  /** World points the pipe runs through: tiles, tiles, pixels up. */
  points: { gx: number; gy: number; z: number }[];
  /** Where the drop is, 0–1 along the pipe; null draws the pipe with no drop. */
  t: number | null;
  /** The words beside the drop. */
  label: string | null;
  /** A write runs green, a read runs in the second colour. */
  kind: 'write' | 'read' | 'flow';
}

export interface FilmFrame {
  street: Street;
  palette: Palette;
  /** Files standing so far. A building with none drawn as its outline only: the design. */
  laid: ReadonlySet<string>;
  /** The file being written now: its brick glows. */
  live: string | null;
  /** Tables lit, with their row counts when known. */
  plots: Record<string, { lit: boolean; rows: number | null }>;
  /** Each building's state word, when it has one. */
  flags: Record<string, { word: string; good: boolean } | undefined>;
  /** Where the agent at work stands, and who it is. */
  agent: { building: string; name: string; vendor: string } | null;
  pipes: FilmPipe[];
  /** What to light: a building, a table, a floor of every building. */
  highlight: { building?: string | null; table?: string | null; floor?: FloorKind | null };
  /** Seconds since the film began: moves the water and the dashes. */
  time: number;
  /** Draw the floors' names on the left of the first building. */
  floorNames?: boolean;
}

/**
 * A token's colour seen through glass: the token itself, painted at an opacity. The colour stays one of
 * Harmony's tokens (the lakefront is drawn with nothing else); only the canvas's alpha changes.
 */
export interface Paint {
  color: string;
  a: number;
}
export type PaintLike = string | Paint;
export const tint = (color: string, a: number): Paint => ({ color, a });

/** Sets the fill or the stroke, and the opacity it is painted at. */
function paint(ctx: CanvasRenderingContext2D, what: 'fill' | 'stroke', p: PaintLike): void {
  const color = typeof p === 'string' ? p : p.color;
  ctx.globalAlpha = typeof p === 'string' ? 1 : p.a;
  if (what === 'fill') ctx.fillStyle = color;
  else ctx.strokeStyle = color;
}

function poly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  fill: PaintLike | null,
  stroke?: PaintLike | null,
  lw = 1,
) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    paint(ctx, 'fill', fill);
    ctx.fill();
  }
  if (stroke) {
    paint(ctx, 'stroke', stroke);
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export interface PlacedBrick {
  path: string;
  floor: FloorKind;
  /** Footprint on the ground (tiles) and its height (pixels). */
  gx: number;
  gy: number;
  s: number;
  z0: number;
  h: number;
}

/**
 * Where each file stands inside its building: on its floor, in a grid across the footprint, in the
 * order the building lists them (its build order). Pure: the same building gives the same places.
 */
export function placeBricks(b: StreetBuilding): PlacedBrick[] {
  const out: PlacedBrick[] = [];
  for (const f of b.floors) {
    const n = f.bricks.length;
    if (!n) continue;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const cell = (b.side - 0.3) / cols;
    const s = cell * 0.72;
    const h = Math.max(4, Math.min((f.z1 - f.z0) * 0.55, 18));
    f.bricks.forEach((br, i) => {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      out.push({
        path: br.path,
        floor: f.kind,
        gx: b.gx + 0.15 + cx * cell + (cell - s) / 2,
        gy: b.gy + 0.15 + cy * cell + (cell - s) / 2,
        s,
        z0: f.z0 + 2,
        h,
      });
    });
  }
  return out;
}

/** The point of a building where a pipe enters at a height: its middle. */
export const buildingPoint = (b: StreetBuilding, z: number) => ({
  gx: b.gx + b.side / 2,
  gy: b.gy + b.side / 2,
  z,
});

/** A pipe from a table's plot up into a building's floor, and on to its facade when `toScreen`. */
export function pipeFromTable(
  s: Street,
  table: string,
  building: string,
  floor: FloorKind,
  toScreen: boolean,
): FilmPipe['points'] | null {
  const p = s.plots.find((x) => x.table === table);
  const b = s.buildings.find((x) => x.id === building);
  if (!p || !b) return null;
  const fl = b.floors.find((f) => f.kind === floor) ?? b.floors[0];
  const zf = fl ? (fl.z0 + fl.z1) / 2 : b.height / 2;
  const pts = [
    { gx: p.gx + p.w / 2, gy: p.gy + p.d / 2, z: -2 },
    { gx: b.gx + b.side / 2, gy: p.gy + p.d / 2, z: -2 },
    { gx: b.gx + b.side / 2, gy: b.gy + b.side / 2, z: -2 },
    buildingPoint(b, zf),
  ];
  if (toScreen) {
    const top = b.floors.find((f) => f.kind === 'shows');
    const zs = top ? (top.z0 + top.z1) / 2 : b.height * 0.85;
    pts.push(buildingPoint(b, zs), { gx: b.gx + b.side / 2, gy: b.gy + b.side, z: zs });
  }
  return pts;
}

/** Draws one frame of the film. */
export function drawFilm(ctx: CanvasRenderingContext2D, frame: FilmFrame): void {
  const { street: s, palette: pal } = frame;
  const c = pal.color;
  const a = at(s);
  const font = (w: number, px: number) => `${w} ${px}px ${pal.sans}`;

  // The ground and its grid.
  const g = s.ground;
  poly(
    ctx,
    [a(g.gx0, g.gy0), a(g.gx1, g.gy0), a(g.gx1, g.gy1), a(g.gx0, g.gy1)],
    tint(c.ink, 0.015),
    c.line,
  );
  paint(ctx, 'stroke', tint(c.ink, 0.045));
  ctx.lineWidth = 1;
  for (let x = Math.ceil(g.gx0); x < g.gx1; x++) {
    const p0 = a(x, g.gy0);
    const p1 = a(x, g.gy1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  for (let y = Math.ceil(g.gy0); y < g.gy1; y++) {
    const p0 = a(g.gx0, y);
    const p1 = a(g.gx1, y);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  // The lake and the far bank; the shore is the edge of the product.
  const L = s.lake;
  poly(
    ctx,
    [a(L.gx0, L.gy0), a(L.gx1, L.gy0), a(L.gx1, L.gy1), a(L.gx0, L.gy1)],
    tint(c.harmony, 0.045),
  );
  paint(ctx, 'stroke', tint(c.harmony, 0.12));
  ctx.setLineDash([12, 18]);
  ctx.lineDashOffset = -frame.time * 8;
  const across = L.gx1 - L.gx0 < L.gy1 - L.gy0;
  for (let t = 0.6; t < (across ? L.gx1 - L.gx0 : L.gy1 - L.gy0); t += 1.1) {
    const p0 = across ? a(L.gx0 + t, L.gy0 + 0.3) : a(L.gx0 + 0.3, L.gy0 + t);
    const p1 = across ? a(L.gx0 + t, L.gy1 - 0.3) : a(L.gx1 - 0.3, L.gy0 + t);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const B = s.bank;
  poly(
    ctx,
    [a(B.gx0, B.gy0), a(B.gx1, B.gy0), a(B.gx1, B.gy1), a(B.gx0, B.gy1)],
    tint(c.ink, 0.02),
    c.line,
  );

  // Roads: the uses between buildings.
  for (const r of s.roads) {
    ctx.beginPath();
    r.points.forEach((p, i) => {
      const q = a(p.gx, p.gy, 0.5);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    paint(ctx, 'stroke', tint(c.ink, 0.1));
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.setLineDash(r.typeOnly ? [4, 8] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Plots: the tables, sunk into the ground; lit once a building writes to them.
  for (const p of s.plots) {
    const st = frame.plots[p.table] ?? { lit: false, rows: null };
    const on = frame.highlight.table === p.table;
    const top = [
      a(p.gx, p.gy, -4),
      a(p.gx + p.w, p.gy, -4),
      a(p.gx + p.w, p.gy + p.d, -4),
      a(p.gx, p.gy + p.d, -4),
    ];
    poly(
      ctx,
      top,
      st.lit ? tint(c.harmony, on ? 0.26 : 0.14) : tint(c.ink, 0.03),
      st.lit ? tint(c.harmony, 0.6) : c['line-strong'],
      on ? 2 : 1,
    );
    poly(
      ctx,
      [
        a(p.gx, p.gy + p.d, 0),
        a(p.gx + p.w, p.gy + p.d, 0),
        a(p.gx + p.w, p.gy + p.d, -4),
        a(p.gx, p.gy + p.d, -4),
      ],
      tint(c.canvas, 0.6),
    );
    const m = a(p.gx + p.w / 2, p.gy + p.d / 2, -4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.font = font(600, 12);
    paint(ctx, 'fill', st.lit ? c.accent : c['ink-muted']);
    ctx.fillText(p.table, m.x, m.y - 6);
    ctx.globalAlpha = 1;
    ctx.font = font(400, 10);
    paint(ctx, 'fill', c['ink-faint']);
    ctx.fillText(
      st.rows === null
        ? st.lit
          ? 'in use'
          : 'empty'
        : `${st.rows} row${st.rows === 1 ? '' : 's'}`,
      m.x,
      m.y + 8,
    );
  }

  // Jetties: the outside services across the water.
  for (const j of s.jetties) {
    const P = j.pier;
    poly(
      ctx,
      [a(P.gx0, P.gy0, 1), a(P.gx1, P.gy0, 1), a(P.gx1, P.gy1, 1), a(P.gx0, P.gy1, 1)],
      tint(c.ink, 0.08),
      tint(c.ink, 0.25),
    );
    const l = a((j.landing.gx0 + j.landing.gx1) / 2, (j.landing.gy0 + j.landing.gy1) / 2, 0);
    ctx.globalAlpha = 1;
    ctx.font = font(500, 12);
    paint(ctx, 'fill', c['ink-muted']);
    ctx.textAlign = 'center';
    ctx.fillText(j.service, l.x, l.y - 10);
  }

  // Buildings, back to front.
  const placed = new Map<string, PlacedBrick[]>();
  for (const b of s.buildings) placed.set(b.id, placeBricks(b));
  const order = [...s.buildings].sort((x, y) => x.gx + x.gy + x.side - (y.gx + y.gy + y.side));
  for (const b of order) drawGlassBuilding(ctx, frame, b, placed.get(b.id)!, a, font);

  // Pipes, over everything, with the drop and its words.
  for (const p of frame.pipes) drawPipe(ctx, frame, p, a, font);

  // The agent at work, standing at the front corner of its building.
  if (frame.agent) {
    const b = s.buildings.find((x) => x.id === frame.agent!.building);
    if (b) {
      const f = a(b.gx + b.side + 0.35, b.gy + b.side + 0.35, 0);
      const r = 8;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, r * 1.2, r * 0.45, 0, 0, Math.PI * 2);
      paint(ctx, 'fill', tint(c.canvas, 0.5));
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(f.x - r * 0.7, f.y - r * 2.6, r * 1.4, r * 2.2, r * 0.5);
      paint(ctx, 'fill', c.harmony);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(f.x, f.y - r * 3.1, r * 0.6, 0, Math.PI * 2);
      paint(ctx, 'fill', c.ink);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
      ctx.font = font(600, 11);
      paint(ctx, 'fill', c.ink);
      ctx.fillText(frame.agent.name, f.x, f.y - r * 4.4);
      ctx.globalAlpha = 1;
      ctx.font = font(400, 10);
      paint(ctx, 'fill', c['ink-muted']);
      ctx.fillText(frame.agent.vendor, f.x, f.y - r * 4.4 + 13);
    }
  }
}

function drawGlassBuilding(
  ctx: CanvasRenderingContext2D,
  frame: FilmFrame,
  b: StreetBuilding,
  bricks: PlacedBrick[],
  a: (gx: number, gy: number, z?: number) => Pt,
  font: (w: number, px: number) => string,
) {
  const c = frame.palette.color;
  const standing = bricks.filter((x) => frame.laid.has(x.path));
  const design = standing.length === 0;
  const on = frame.highlight.building === b.id;
  const H = b.height;
  const faces = boxFaces(b.gx, b.gy, b.side, b.side, H, a);
  const back = {
    left: [
      a(b.gx, b.gy, 0),
      a(b.gx, b.gy + b.side, 0),
      a(b.gx, b.gy + b.side, H),
      a(b.gx, b.gy, H),
    ],
    right: [
      a(b.gx, b.gy, 0),
      a(b.gx + b.side, b.gy, 0),
      a(b.gx + b.side, b.gy, H),
      a(b.gx, b.gy, H),
    ],
  };
  // Its shadow, then the far walls of glass.
  poly(
    ctx,
    [
      a(b.gx - 0.1, b.gy - 0.1),
      a(b.gx + b.side + 0.1, b.gy - 0.1),
      a(b.gx + b.side + 0.1, b.gy + b.side + 0.1),
      a(b.gx - 0.1, b.gy + b.side + 0.1),
    ],
    tint(c.canvas, 0.35),
  );
  const glass = design ? null : tint(c.harmony, on ? 0.09 : 0.05);
  const edge = tint(c.ink, design ? 0.18 : 0.12);
  poly(ctx, back.left, glass, edge);
  poly(ctx, back.right, glass, edge);
  // Its floors: a slab each, lit when asked for.
  for (const f of b.floors) {
    const lit = frame.highlight.floor === f.kind;
    poly(
      ctx,
      [
        a(b.gx, b.gy, f.z0),
        a(b.gx + b.side, b.gy, f.z0),
        a(b.gx + b.side, b.gy + b.side, f.z0),
        a(b.gx, b.gy + b.side, f.z0),
      ],
      lit ? tint(c.harmony, 0.14) : tint(c.ink, design ? 0.012 : 0.025),
      lit ? tint(c.harmony, 0.6) : tint(c.ink, 0.1),
    );
  }
  // The bricks laid so far, back to front; the one being written glows.
  for (const k of [...standing].sort((x, y) => x.gx + x.gy - (y.gx + y.gy) || x.z0 - y.z0)) {
    const live = frame.live === k.path;
    const f = boxFaces(k.gx, k.gy, k.s, k.s, k.h, (x, y, z) => a(x, y, z + k.z0));
    poly(ctx, f.left, tint(c.harmony, live ? 0.55 : 0.28));
    poly(ctx, f.right, tint(c.harmony, live ? 0.4 : 0.18));
    poly(ctx, f.top, live ? c.harmony : tint(c.harmony, 0.66), live ? c.ink : null);
    if (live) {
      const m = a(k.gx + k.s / 2, k.gy + k.s / 2, k.z0 + k.h);
      for (const [r, al] of [
        [44, 0.08],
        [28, 0.12],
        [16, 0.18],
      ] as const) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        paint(ctx, 'fill', tint(c.harmony, al));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  // The near walls of glass, and the roof.
  const near = design ? null : tint(c.ink, 0.035);
  poly(ctx, faces.right, near, tint(c.ink, design ? 0.3 : 0.26), on ? 2 : 1);
  poly(ctx, faces.left, near, tint(c.ink, design ? 0.3 : 0.26), on ? 2 : 1);
  poly(
    ctx,
    faces.top,
    design ? null : tint(c.ink, 0.05),
    tint(c.ink, design ? 0.4 : 0.34),
    on ? 2 : 1,
  );
  if (design) {
    ctx.setLineDash([6, 6]);
    poly(ctx, faces.outline, null, tint(c.harmony, 0.35));
    ctx.setLineDash([]);
  }
  // The floors' names, once, on the left of the building, when asked.
  if (frame.floorNames) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    ctx.font = font(500, 11);
    for (const f of b.floors) {
      const p = a(b.gx, b.gy + b.side, (f.z0 + f.z1) / 2);
      paint(ctx, 'fill', frame.highlight.floor === f.kind ? c.accent : c['ink-muted']);
      ctx.fillText(FLOOR_LABEL[f.kind], p.x - 8, p.y);
    }
  }
  // Its name, and its state.
  const top = a(b.gx + b.side / 2, b.gy + b.side / 2, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  ctx.font = font(on ? 600 : 500, 13);
  paint(ctx, 'fill', c.ink);
  ctx.fillText(b.name, top.x, top.y - 22);
  const flag = frame.flags[b.id];
  const laidOf = bricks.length ? `${standing.length} of ${bricks.length} parts` : '';
  const word = flag ? flag.word : design ? 'Not built yet' : laidOf;
  ctx.globalAlpha = 1;
  ctx.font = font(500, 11);
  paint(ctx, 'fill', flag?.good ? c.accent : c['ink-muted']);
  ctx.fillText(word ? `▶ ${word}` : '', top.x, top.y - 8);
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  frame: FilmFrame,
  p: FilmPipe,
  a: (gx: number, gy: number, z?: number) => Pt,
  font: (w: number, px: number) => string,
) {
  const c = frame.palette.color;
  const col = p.kind === 'read' ? c['series-grid'] : c.harmony;
  const pts = p.points.map((q) => a(q.gx, q.gy, q.z));
  if (pts.length < 2) return;
  const path = () => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  paint(ctx, 'stroke', tint(col, 0.28));
  ctx.lineWidth = 10;
  ctx.stroke();
  path();
  paint(ctx, 'stroke', tint(col, 0.75));
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = (p.kind === 'read' ? 1 : -1) * frame.time * 40;
  ctx.stroke();
  ctx.setLineDash([]);
  if (p.t === null) return;
  const d = alongPicture(pts, Math.max(0, Math.min(1, p.t)));
  ctx.beginPath();
  ctx.arc(d.x, d.y, 7, 0, Math.PI * 2);
  paint(ctx, 'fill', col);
  ctx.shadowColor = col;
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (p.label) {
    ctx.globalAlpha = 1;
    ctx.font = font(500, 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(p.label).width;
    paint(ctx, 'fill', tint(c.canvas, 0.85));
    ctx.beginPath();
    ctx.roundRect(d.x + 12, d.y - 22, w + 16, 22, 11);
    ctx.fill();
    paint(ctx, 'fill', c.ink);
    ctx.fillText(p.label, d.x + 20, d.y - 11);
  }
}

/** The point a fraction t along a polyline. */
export function alongPicture(pts: Pt[], t: number): Pt {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i]!.x, q.y - pts[i]!.y));
  let u = t * seg.reduce((x, y) => x + y, 0);
  for (let i = 0; i < seg.length; i++) {
    if (u <= seg[i]! || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, u / seg[i]!) : 0;
      return {
        x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * f,
        y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * f,
      };
    }
    u -= seg[i]!;
  }
  return pts.at(-1)!;
}

export type FilmPick = { building: string } | { table: string } | null;

/** What lies under a point of the picture: a building (any of its faces) or a table's plot. */
export function pickFilm(s: Street, p: Pt): FilmPick {
  const a = at(s);
  const order = [...s.buildings].sort((x, y) => y.gx + y.gy + y.side - (x.gx + x.gy + x.side));
  for (const b of order) {
    const f = boxFaces(b.gx, b.gy, b.side, b.side, b.height, a);
    if (inPolygon(p, f.top) || inPolygon(p, f.left) || inPolygon(p, f.right))
      return { building: b.id };
  }
  for (const pl of s.plots) {
    const q = [
      a(pl.gx, pl.gy),
      a(pl.gx + pl.w, pl.gy),
      a(pl.gx + pl.w, pl.gy + pl.d),
      a(pl.gx, pl.gy + pl.d),
    ];
    if (inPolygon(p, q)) return { table: pl.table };
  }
  return null;
}

export { FLOOR_ORDER };

/** One block of the foundation, as the time-lapse lays it. */
export interface FoundationBlock {
  name: string;
  layer: 'talks' | 'shows' | 'decides' | 'remembers' | 'checks';
}

export interface FoundationPicture {
  palette: Palette;
  width: number;
  height: number;
  blocks: FoundationBlock[];
  /** How many blocks stand, and how far the next one has risen (0–1). */
  laid: number;
  rise: number;
  orientation: 0 | 1 | 2 | 3;
  scale: number;
}

const LAYER_FLOOR: Record<FoundationBlock['layer'], number> = {
  remembers: 0,
  decides: 1,
  shows: 2,
  talks: 3,
  checks: -1,
};
const LAYER_NAME = ['Remembers', 'Decides', 'Shows', 'Talks to'];

/**
 * The foundation's time-lapse, filmed from the ground: one glass building on a dug plot, its floors
 * appearing as the first block of each is laid, each block rising into place with its name; the checks
 * stand around the building, outside it. The same frame always draws the same picture.
 */
export function drawFoundation(ctx: CanvasRenderingContext2D, f: FoundationPicture): void {
  const c = f.palette.color;
  const W = 6;
  const tile = 64 * f.scale;
  const fh = 58 * f.scale;
  const turn = (x: number, y: number): [number, number] => {
    let dx = x - W / 2;
    let dy = y - W / 2;
    for (let i = 0; i < f.orientation; i++) [dx, dy] = [-dy, dx];
    return [dx + W / 2, dy + W / 2];
  };
  const P = (x: number, y: number, z = 0): Pt => {
    const [rx, ry] = turn(x, y);
    return {
      x: f.width / 2 + ((rx - ry) * tile) / 2,
      y: f.height * 0.66 + ((rx + ry - W) * tile) / 4 - z,
    };
  };
  const font = (w: number, px: number) => `${w} ${px}px ${f.palette.sans}`;
  for (let x = 0; x < W; x++)
    for (let y = 0; y < W; y++)
      poly(
        ctx,
        [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)],
        tint(c.ink, 0.012),
        tint(c.ink, 0.05),
      );
  const bx = 1;
  const by = 1;
  const bw = 4;
  poly(
    ctx,
    [P(bx, by, -10), P(bx + bw, by, -10), P(bx + bw, by + bw, -10), P(bx, by + bw, -10)],
    tint(c.harmony, 0.08),
    tint(c.harmony, 0.35),
  );
  const g = P(bx + bw / 2, by + bw / 2, -10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1;
  ctx.font = font(500, 12);
  paint(ctx, 'fill', c.accent);
  ctx.fillText('the ground · the database', g.x, g.y);

  const standing = f.blocks.slice(0, Math.min(f.blocks.length, f.laid + (f.rise > 0 ? 1 : 0)));
  const top = Math.max(-1, ...standing.map((b) => LAYER_FLOOR[b.layer]));
  const H = (top + 1) * fh;
  if (top >= 0) {
    poly(
      ctx,
      [P(bx, by, 0), P(bx + bw, by, 0), P(bx + bw, by, H), P(bx, by, H)],
      tint(c.harmony, 0.05),
      tint(c.ink, 0.1),
    );
    poly(
      ctx,
      [P(bx, by, 0), P(bx, by + bw, 0), P(bx, by + bw, H), P(bx, by, H)],
      tint(c.harmony, 0.05),
      tint(c.ink, 0.1),
    );
    for (let k = 0; k <= top; k++) {
      poly(
        ctx,
        [
          P(bx, by, k * fh),
          P(bx + bw, by, k * fh),
          P(bx + bw, by + bw, k * fh),
          P(bx, by + bw, k * fh),
        ],
        tint(c.ink, 0.03),
        tint(c.ink, 0.14),
      );
      const q = P(bx - 0.1, by + bw, k * fh + fh / 2);
      ctx.textAlign = 'right';
      ctx.globalAlpha = 1;
      ctx.font = font(500, 12);
      paint(ctx, 'fill', c['ink-muted']);
      ctx.fillText(LAYER_NAME[k]!, q.x - 6, q.y);
    }
  }
  const slots = new Map<number, number>();
  standing.forEach((b, i) => {
    const fl = LAYER_FLOOR[b.layer];
    const k = slots.get(fl) ?? 0;
    slots.set(fl, k + 1);
    let x: number;
    let y: number;
    let z: number;
    if (fl < 0) {
      x = k % 2 ? bx + bw + 0.25 : bx - 0.9;
      y = by + 0.1 + Math.floor(k / 2) * 0.8;
      z = 0;
    } else {
      x = bx + 0.3 + (k % 3) * 1.2;
      y = by + 0.3 + Math.floor(k / 3) * 1.2;
      z = fl * fh + 3;
    }
    const live = i === f.laid && f.rise > 0;
    if (live) z += (1 - Math.min(1, f.rise * 2.5)) * 60 * f.scale;
    const s = 0.7;
    const h = 22 * f.scale;
    const bf = boxFaces(x, y, s, s, h, (gx, gy, zz) => P(gx, gy, zz + z));
    const checks = fl < 0;
    const col = checks ? c['ink-muted'] : c.harmony;
    poly(ctx, bf.left, tint(col, live ? 0.55 : 0.3));
    poly(ctx, bf.right, tint(col, live ? 0.4 : 0.2));
    poly(ctx, bf.top, live ? col : tint(col, 0.65), live ? c.ink : null);
    const lp = P(x + s / 2, y + s / 2, z + h + 12);
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1;
    ctx.font = font(live ? 600 : 400, live ? 12 : 10);
    paint(ctx, 'fill', live ? c.ink : c['ink-muted']);
    ctx.fillText(b.name, lp.x, lp.y);
  });
  if (top >= 0) {
    poly(
      ctx,
      [P(bx + bw, by, 0), P(bx + bw, by + bw, 0), P(bx + bw, by + bw, H), P(bx + bw, by, H)],
      tint(c.ink, 0.03),
      tint(c.ink, 0.24),
    );
    poly(
      ctx,
      [P(bx, by + bw, 0), P(bx + bw, by + bw, 0), P(bx + bw, by + bw, H), P(bx, by + bw, H)],
      tint(c.ink, 0.025),
      tint(c.ink, 0.24),
    );
  }
}
