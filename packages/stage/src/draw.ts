/// <reference lib="dom" />
// Paints the Street, the Building level and the inside on a canvas, with Harmony's tokens only (palette.ts): the
// ground in `surface` with `line` hairlines, the lake in `surface-2` with a `glass` sheen, plots lit
// `accent-soft`, glass buildings with `line` edges, the selected building as the folder (the one green
// object), flags in the three words, roads in `line-strong` (dotted when the use is a type only), jetties
// in `series-grid`, the active crane and the drones' beam in `harmony` with its `glow`, idle cranes in
// `ink-faint`. The inside (Stage 11) is drawn the same way: glass bricks on their floors, the open one as
// the folder. What is shown is decided by street(), building(), inside() and the replay; this only paints.
import type { ScreenState } from '@rama/blueprint/metrics';
import type { Verdict } from '@rama/audit/view';
import { buildingAt, type BuildingScene } from './building.ts';
import {
  areaPolygon,
  brickOnFace,
  buildingFaces,
  facadeShape,
  floorFaceOf,
  jettyShapes,
  plotPolygon,
  subFace,
} from './geometry.ts';
import {
  brickTop,
  floorSlab,
  insideAt,
  insideBrickFaces,
  standsAt,
  type InsideBrick,
  type InsideFloorKind,
  type InsideScene,
} from './inside.ts';
import { faceTransform, type Pt } from './iso.ts';
import { codeWindow, type TypedLine } from './typing.ts';
import type { Palette } from './palette.ts';
import { craneAt, laid, type StreetTimeline } from './replay.ts';
import { at, type Street, type StreetBuilding } from './street.ts';

export interface Flag {
  state: ScreenState;
  /** The names that signed, when Confirmed. */
  by: string[];
}

export interface StreetFrame {
  street: Street;
  palette: Palette;
  flags: Record<string, Flag>;
  /** The selected building: drawn as the folder, the one green object. */
  selected: string | null;
  hover: string | null;
  /** The replay: lift k (0 = empty ground) at progress p. Absent: everything built. */
  replay?: { timeline: StreetTimeline; k: number; p: number } | null;
  /** A loaded picture for a facade's shot, or null while it loads. */
  image?: (shot: string) => CanvasImageSource | null;
  /** The audit: badges that stay per building; drones and the building under a beam while it flies. */
  audit?: {
    badges: Record<string, Verdict>;
    drones?: Pt[];
    scan?: { building: string; drone: number } | null;
  } | null;
  /** Milliseconds, for the live pulse; 0 under reduced motion. */
  clock?: number;
  /** The local hour of the lift being replayed (replay.ts hourOf): the sky over the Street. */
  hour?: number | null;
}

const FLAG_TONE = { Verified: 'positive', Confirmed: 'accent', Unverified: 'ink-muted' } as const;
const BADGE_TONE = { defect: 'negative', note: 'warning', pass: 'positive' } as const;
const BADGE_WORD = { defect: 'Defect', note: 'Note', pass: 'Passed' } as const;

function poly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  fill: string | null,
  stroke: string | null,
  width = 1,
) {
  poly(ctx, pts);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** The ground behind everything: `canvas` with Harmony's two aurora glows. */
function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Palette) {
  const c = pal.color;
  ctx.fillStyle = c.canvas;
  ctx.fillRect(0, 0, w, h);
  for (const [x, y, r] of [
    [w * 0.18, h * 0.1, Math.max(w, h) * 0.45],
    [w * 0.85, h * 0.25, Math.max(w, h) * 0.35],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c.glow);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

/**
 * The sky during the replay, at the lift's own hour: the sun crosses from six in the morning to seven in
 * the evening; at night the moon, and the picture dims.
 */
export function sky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hour: number,
  pal: Palette,
) {
  const c = pal.color;
  const day = hour >= 6 && hour < 19;
  const t = day ? (hour - 6) / 13 : ((hour + 5) % 24) / 11;
  const x = width * (0.1 + 0.8 * t);
  const y = 90 - Math.sin(Math.PI * t) * 60;
  if (!day) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.canvas;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = day ? c['series-grid'] : c['ink-muted'];
  ctx.beginPath();
  ctx.arc(x, y, day ? 16 : 11, 0, Math.PI * 2);
  ctx.fill();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  pal: Palette,
  size = 13,
  weight = 600,
) {
  ctx.font = `${weight} ${size}px ${pal.sans}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
}

/** A flag on a pole, coloured by its word, and always the word beside it. */
function flag(ctx: CanvasRenderingContext2D, f: Flag, x: number, y: number, pal: Palette) {
  const c = pal.color;
  const tone = c[FLAG_TONE[f.state]];
  ctx.strokeStyle = c['line-strong'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 26);
  ctx.stroke();
  fillPoly(
    ctx,
    [
      { x, y: y - 26 },
      { x: x + 14, y: y - 21 },
      { x, y: y - 16 },
    ],
    tone,
    null,
  );
  ctx.font = `600 11px ${pal.sans}`;
  ctx.fillStyle = tone;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    f.state === 'Confirmed' && f.by.length ? `Confirmed by ${f.by.join(', ')}` : f.state,
    x + 18,
    y - 21,
  );
}

function badge(ctx: CanvasRenderingContext2D, v: Verdict, x: number, y: number, pal: Palette) {
  const c = pal.color;
  const word = BADGE_WORD[v];
  ctx.font = `600 11px ${pal.sans}`;
  const w = ctx.measureText(word).width + 16;
  const soft =
    v === 'defect' ? c['negative-soft'] : v === 'note' ? c['warning-soft'] : c['accent-soft'];
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 10, w, 20, 10);
  ctx.fillStyle = soft;
  ctx.fill();
  ctx.strokeStyle = c[BADGE_TONE[v]];
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = c[BADGE_TONE[v]];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, x, y);
}

function crane(
  ctx: CanvasRenderingContext2D,
  base: Pt,
  top: number,
  active: boolean,
  pal: Palette,
) {
  const c = pal.color;
  const color = active ? c.harmony : c['ink-faint'];
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(base.x, top);
  ctx.moveTo(base.x - 18, top + 6);
  ctx.lineTo(base.x + 52, top + 6);
  ctx.moveTo(base.x + 40, top + 6);
  ctx.lineTo(base.x + 40, top + 34);
  ctx.stroke();
  if (active) {
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = c.harmony;
    ctx.fillRect(base.x + 35, top + 34, 10, 6);
    ctx.shadowBlur = 0;
  }
}

/** A picture's own size, when the source says it. */
function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const x = img as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: unknown;
    height?: unknown;
  };
  const w = x.naturalWidth ?? (typeof x.width === 'number' ? x.width : 0);
  const h = x.naturalHeight ?? (typeof x.height === 'number' ? x.height : 0);
  return { w, h };
}

/** How tall a building stands at this point of the replay: up to its highest laid floor. */
export function standingHeight(b: StreetBuilding, frame: Pick<StreetFrame, 'replay'>): number {
  const r = frame.replay;
  if (!r) return b.height;
  let top = 0;
  for (const f of b.floors)
    if (f.bricks.some((x) => laid(r.timeline, x.path, r.k, r.p) !== 'none')) top = f.z1;
  // With its top floor laid it stands at its full height (a small building is raised to MIN_HEIGHT).
  return top > 0 && top === b.floors.at(-1)!.z1 ? b.height : top;
}

export function drawStreet(ctx: CanvasRenderingContext2D, frame: StreetFrame): void {
  const { street: s, palette: pal } = frame;
  const c = pal.color;
  const a = at(s);
  backdrop(ctx, s.width, s.height, pal);
  if (frame.hour !== undefined && frame.hour !== null) sky(ctx, s.width, s.height, frame.hour, pal);

  // The ground, with its grid.
  const g = s.ground;
  fillPoly(
    ctx,
    [a(g.gx0, g.gy0), a(g.gx1, g.gy0), a(g.gx1, g.gy1), a(g.gx0, g.gy1)],
    c.surface,
    c.line,
  );
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  for (let x = g.gx0 + 1; x < g.gx1; x++) {
    ctx.beginPath();
    const p0 = a(x, g.gy0);
    const p1 = a(x, g.gy1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // The lake: the edge of the product, with a glass sheen; the far bank where the outside services stand.
  const lake = areaPolygon(s, s.lake);
  fillPoly(ctx, lake, c['surface-2'], c.line);
  fillPoly(ctx, lake, c.glass, null);
  // Ripples along the water, short dashes that read as a surface, not as roads: along its length.
  ctx.strokeStyle = c['glass-strong'];
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 22]);
  const L = s.lake;
  const across = L.gx1 - L.gx0 < L.gy1 - L.gy0;
  for (let t = 0.75; t < (across ? L.gx1 - L.gx0 : L.gy1 - L.gy0); t += 1.25) {
    const p0 = across ? a(L.gx0 + t, L.gy0 + 0.4) : a(L.gx0 + 0.4, L.gy0 + t);
    const p1 = across ? a(L.gx0 + t, L.gy1 - 0.4) : a(L.gx1 - 0.4, L.gy0 + t);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const B = s.bank;
  if (B.gx1 > B.gx0 && B.gy1 > B.gy0) fillPoly(ctx, areaPolygon(s, B), c.surface, c.line);

  const focus = frame.hover ?? frame.selected;
  const focusB = s.buildings.find((b) => b.id === focus) ?? null;
  // Plots: the tables, lit when a building touches them, outlined when the building in focus does.
  // During the replay a plot appears with the file that defines it, a road and a jetty with the
  // buildings at both ends.
  const r = frame.replay;
  const stands = (id: string) => {
    const b = s.buildings.find((x) => x.id === id);
    return !b || standingHeight(b, frame) > 0;
  };
  for (const p of s.plots) {
    if (r && r.timeline.laidIn.has(p.file) && laid(r.timeline, p.file, r.k, r.p) === 'none')
      continue;
    const touched = p.readBy.length + p.writtenBy.length > 0;
    const mine = focusB && (p.readBy.includes(focusB.id) || p.writtenBy.includes(focusB.id));
    fillPoly(
      ctx,
      plotPolygon(s, p),
      touched ? c['accent-soft'] : c.surface,
      mine ? c.accent : c.line,
      mine ? 2 : 1,
    );
    const mid = a(p.gx + p.w / 2, p.gy + p.d / 2);
    ctx.font = `500 11px ${pal.sans}`;
    ctx.fillStyle = touched ? c.ink : c['ink-muted'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.table, mid.x, mid.y);
  }
  // Roads: one building using another.
  for (const road of s.roads) {
    if (!stands(road.from) || !stands(road.to)) continue;
    const r = road;
    const on = focus && (r.from === focus || r.to === focus);
    ctx.strokeStyle = on ? c.ink : c['line-strong'];
    ctx.lineWidth = Math.min(4, 1 + Math.log2(r.uses));
    ctx.setLineDash(r.typeOnly ? [3, 5] : []);
    ctx.beginPath();
    r.points.forEach((q, i) => {
      const p = a(q.gx, q.gy);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Jetties: the outside services across the water.
  for (const j of s.jetties) {
    if (!j.users.some(stands)) continue;
    const { pier, landing } = jettyShapes(s, j);
    const on = focusB && j.users.includes(focusB.id);
    fillPoly(ctx, pier, c['surface-2'], c['series-grid'], on ? 2.5 : 1.5);
    fillPoly(ctx, landing.left, c.glass, c['series-grid']);
    fillPoly(ctx, landing.right, c.glass, c['series-grid']);
    fillPoly(ctx, landing.top, c['glass-strong'], c['series-grid']);
    label(ctx, j.service, landing.top[0]!.x, landing.top[0]!.y - 6, c['series-grid'], pal, 12);
  }

  // Buildings, back to front.
  const order = [...s.buildings].sort((x, y) => x.gx + x.gy + x.side - (y.gx + y.gy + y.side));
  const craneB = frame.replay
    ? craneAt(frame.replay.timeline, frame.replay.k, frame.replay.p)
    : null;
  for (const b of order) {
    const h = standingHeight(b, frame);
    if (h <= 0) continue;
    const faces = buildingFaces(s, b, h);
    const selected = frame.selected === b.id;
    const hover = frame.hover === b.id;
    const edge = hover ? c['line-strong'] : c.line;
    if (selected) {
      fillPoly(ctx, faces.left, c.folder, c['folder-hi']);
      fillPoly(ctx, faces.right, c['folder-deep'], c['folder-hi']);
      fillPoly(ctx, faces.top, c['folder-hi'], c['folder-hi']);
    } else {
      fillPoly(ctx, faces.left, c.glass, edge, hover ? 1.5 : 1);
      fillPoly(ctx, faces.right, c.glass, edge, hover ? 1.5 : 1);
      fillPoly(ctx, faces.top, c['glass-strong'], edge, hover ? 1.5 : 1);
    }
    // The facade: the first screen's real picture behind strong glass.
    const shot = b.facades.find((f) => f.shot)?.shot ?? null;
    const img = shot ? (frame.image?.(shot) ?? null) : null;
    if (img && !selected) {
      ctx.save();
      poly(ctx, faces.left);
      ctx.clip();
      const m = faceTransform(subFace(faces.left, 0.08, 0.92, 0.06, 0.94));
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.globalAlpha = 0.85;
      // The top of the screen, cut to the face's shape, as a person sees it on arrival.
      const { w: iw, h: ih } = sizeOf(img);
      const faceW = Math.hypot(
        faces.left[1]!.x - faces.left[0]!.x,
        faces.left[1]!.y - faces.left[0]!.y,
      );
      const faceH = h;
      const sh = iw ? Math.min(ih, (iw * faceH) / faceW) : 0;
      if (iw && sh) ctx.drawImage(img, 0, 0, iw, sh, 0, 0, 1, 1);
      else ctx.drawImage(img, 0, 0, 1, 1);
      ctx.restore();
      fillPoly(ctx, faces.left, c['glass-strong'], null);
    }
    // Bricks through the glass, on the side face: laid in ink-muted, the ones this lift lays in ink.
    for (const f of b.floors) {
      if (f.z0 >= h) continue;
      if (f.z0 > 0) {
        const line = subFace(faces.right, 0, 1, 1 - f.z0 / h, 1 - f.z0 / h);
        ctx.strokeStyle = selected ? c['folder-hi'] : c.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(line[0]!.x, line[0]!.y);
        ctx.lineTo(line[1]!.x, line[1]!.y);
        ctx.stroke();
      }
      for (const x of f.bricks) {
        const st = frame.replay
          ? laid(frame.replay.timeline, x.path, frame.replay.k, frame.replay.p)
          : 'built';
        if (st === 'none' || x.z1 > h) continue;
        const now =
          frame.replay &&
          frame.replay.k >= 1 &&
          frame.replay.timeline.lifts[frame.replay.k - 1]!.events.some((e) => e.path === x.path);
        const fill =
          st === 'placing' ? c.harmony : selected ? c['on-folder'] : now ? c.ink : c['ink-muted'];
        fillPoly(ctx, brickOnFace(faces.right, h, x), fill, null);
      }
    }
    const peak = Math.min(...faces.top.map((p) => p.y));
    const mid = { x: (faces.top[0]!.x + faces.top[2]!.x) / 2, y: peak };
    label(ctx, b.name, mid.x, peak - 8, c.ink, pal, 13, 700);
    const f = frame.flags[b.id];
    if (f) flag(ctx, f, faces.top[3]!.x + 6, peak - 26, pal);
    const v = frame.audit?.badges[b.id];
    // The badge sits by the roof's right corner, clear of the name and the flag above.
    if (v) badge(ctx, v, faces.top[1]!.x + 26, faces.top[1]!.y - 4, pal);
    if (craneB === b.id) crane(ctx, faces.right[0]!, peak - 80, true, pal);
  }

  // The drones and their beam over the building being scanned.
  const au = frame.audit;
  if (au?.drones) {
    au.drones.forEach((d, i) => {
      if (au.scan && au.scan.drone === i) {
        const b = s.buildings.find((x) => x.id === au.scan!.building);
        if (b) {
          const faces = buildingFaces(s, b, standingHeight(b, frame));
          ctx.fillStyle = c.glow;
          poly(ctx, [d, faces.top[1]!, faces.top[3]!]);
          ctx.fill();
        }
      }
      drone(ctx, d, pal);
    });
  }
}

/** A drone: its body in `ink`, its rotors in `harmony`. */
function drone(ctx: CanvasRenderingContext2D, d: Pt, pal: Palette) {
  const c = pal.color;
  ctx.fillStyle = c.ink;
  ctx.strokeStyle = c.harmony;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(d.x - 12, d.y - 4, 24, 8, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.harmony;
  ctx.fillRect(d.x - 16, d.y - 7, 8, 2);
  ctx.fillRect(d.x + 8, d.y - 7, 8, 2);
}

export interface BuildingFrame {
  scene: BuildingScene;
  palette: Palette;
  flag: Flag | null;
  image?: (shot: string) => CanvasImageSource | null;
  /** The open figure (its appearance key): its trail is the one green object. */
  picked: string | null;
  hover: string | null;
  /** Verdicts per file from the audit shown, as small marks on the bricks. */
  verdicts?: Record<string, Verdict>;
  /** Stage 11: the file the builder is writing now and its lines so far: its brick glows and grows. */
  writing?: { path: string; lines: number } | null;
}

export function drawBuilding(ctx: CanvasRenderingContext2D, frame: BuildingFrame): void {
  const { scene: sc, palette: pal } = frame;
  const c = pal.color;
  backdrop(ctx, sc.width, sc.height, pal);
  const f = sc.faces;
  // The plot it stands on.
  const a = buildingAt(sc);
  fillPoly(
    ctx,
    [a(-1, -1), a(sc.w + 1, -1), a(sc.w + 1, sc.d + 1), a(-1, sc.d + 1)],
    c.surface,
    c.line,
  );
  fillPoly(ctx, f.right, c.glass, c.line);
  fillPoly(ctx, f.left, c.glass, c.line);
  fillPoly(ctx, f.top, c['glass-strong'], c.line);

  // The side face: floors and their bricks through the glass, each floor named on its outer side.
  const side = floorFaceOf(sc);
  const onLeft = sc.facadeFace === 'right';
  for (const fl of sc.floors) {
    const band = subFace(side, 0, 1, 1 - fl.z1 / sc.h, 1 - fl.z0 / sc.h);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(band[0]!.x, band[0]!.y);
    ctx.lineTo(band[1]!.x, band[1]!.y);
    ctx.stroke();
    for (const x of fl.bricks) {
      const on = frame.hover === x.path;
      const writing = frame.writing?.path === x.path ? frame.writing : null;
      // The brick being written glows, and grows upward by its line count (up to twice its height).
      const grown = writing
        ? { ...x, z1: x.z1 + (x.z1 - x.z0) * Math.min(1, writing.lines / 60) }
        : x;
      fillPoly(
        ctx,
        brickOnFace(side, sc.h, grown),
        writing ? c.harmony : on ? c.ink : c['ink-muted'],
        writing ? c.glow : on ? c.accent : null,
        writing ? 3 : 1.5,
      );
      const v = frame.verdicts?.[x.path];
      if (v && v !== 'pass') {
        const q = brickOnFace(side, sc.h, x)[2]!;
        ctx.fillStyle = c[BADGE_TONE[v]];
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const [e0, e1] = onLeft ? [band[0]!, band[3]!] : [band[1]!, band[2]!];
    const mid = { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 };
    ctx.font = `600 12px ${pal.sans}`;
    ctx.fillStyle = c['ink-muted'];
    ctx.textAlign = onLeft ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${fl.label} · ${fl.bricks.length}`, mid.x + (onLeft ? -14 : 14), mid.y);
  }

  // The front face: the real screens behind the glass, figures outlined where the screen shows them.
  for (const p of sc.facades) {
    const panel = facadeShape(sc, p.u0, p.u1);
    const img = p.shot ? (frame.image?.(p.shot) ?? null) : null;
    if (img && p.crop) {
      ctx.save();
      poly(ctx, panel);
      ctx.clip();
      const m = faceTransform(facadeShape(sc, p.u0, p.u1, 0, p.vEnd));
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(img, p.crop.sx, p.crop.sy, p.crop.sw, p.crop.sh, 0, 0, 1, 1);
      ctx.restore();
    }
    fillPoly(ctx, panel, img ? null : c['surface-2'], c['line-strong']);
    if (!img) {
      const mid = panel.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 });
      label(
        ctx,
        p.shot ? 'The picture is loading' : 'Not photographed yet',
        mid.x,
        mid.y,
        c['ink-muted'],
        pal,
        12,
        500,
      );
    }
    for (const g of p.figures) {
      if (!g.at) continue;
      const hs = facadeShape(sc, g.at.u0, g.at.u1, g.at.v0, g.at.v1);
      const open = frame.picked === g.key;
      const hover = frame.hover === g.key;
      ctx.setLineDash(g.traced ? [] : [4, 3]);
      fillPoly(
        ctx,
        hs,
        open ? c['accent-soft'] : null,
        g.traced ? c.accent : c['line-strong'],
        open || hover ? 2.5 : 1.5,
      );
      ctx.setLineDash([]);
    }
    // The screen's name under the panel.
    const base = panel[0]!;
    const end = panel[1]!;
    label(
      ctx,
      p.title,
      (base.x + end.x) / 2,
      (base.y + end.y) / 2 + 24,
      c['ink-muted'],
      pal,
      12,
      600,
    );
  }

  const peak = Math.min(...f.top.map((q) => q.y));
  label(ctx, sc.name, (f.top[0]!.x + f.top[2]!.x) / 2, peak - 12, c.ink, pal, 16, 700);
  if (frame.flag) flag(ctx, frame.flag, f.top[3]!.x + 6, peak - 34, pal);
}

export interface InsideFrame {
  scene: InsideScene;
  palette: Palette;
  /** The open brick: drawn as the folder, the one green object. */
  selected: string | null;
  hover: string | null;
  /** Bricks outlined (a screen's bricks, a search hit, the audit's defects). */
  glow?: ReadonlySet<string>;
  /** The replay: lift k (1-based; 0 before any) of `lifts`. Absent: everything stands. */
  replay?: { k: number; lifts: number } | null;
  /** Bricks of a screen signed at this commit: a small mark on their top. */
  signed?: ReadonlySet<string>;
  verdicts?: Record<string, Verdict>;
  /** The open brick's imports and importers in this building, drawn as cables. */
  links?: { imports: string[]; importedBy: string[] } | null;
  /** The file the builder is writing now: its brick glows and grows. */
  writing?: { path: string; lines: number } | null;
  /** The floor chosen: the others are drawn faint, and only its bricks can be picked. */
  floor?: InsideFloorKind | null;
  /** The audit flying: its drones, and the brick under a beam. */
  drones?: { at: Pt[]; scan: { path: string; drone: number } | null } | null;
}

/** Paints the inside of a building: the far walls of glass, the floors as slabs, every brick on its floor. */
export function drawInside(ctx: CanvasRenderingContext2D, frame: InsideFrame): void {
  const { scene: s, palette: pal } = frame;
  const c = pal.color;
  backdrop(ctx, s.width, s.height, pal);
  const a = insideAt(s);
  const top = s.h + 20;
  // The two far walls, glass seen from inside; the near edges as hairlines only, so nothing hides a brick.
  fillPoly(ctx, [a(0, 0), a(s.w, 0), a(s.w, 0, top), a(0, 0, top)], c.glass, c.line);
  fillPoly(ctx, [a(0, 0), a(0, s.d), a(0, s.d, top), a(0, 0, top)], c.glass, c.line);
  const faint = (kind: InsideFloorKind) => (frame.floor && frame.floor !== kind ? 0.22 : 1);
  for (const f of s.floors) {
    ctx.globalAlpha = faint(f.kind);
    fillPoly(ctx, floorSlab(s, f), c.surface, frame.floor === f.kind ? c.accent : c['line-strong']);
    const edge = a(0, s.d, f.z0);
    ctx.font = `600 12px ${pal.sans}`;
    ctx.fillStyle = c['ink-muted'];
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${f.label} · ${f.count}`, edge.x - 14, edge.y - 10);
  }
  ctx.globalAlpha = 1;
  const standing = (x: InsideBrick) =>
    !frame.replay || standsAt(x, frame.replay.k, frame.replay.lifts);
  for (const x of s.bricks) {
    ctx.globalAlpha = faint(x.floor);
    if (!standing(x)) {
      // Not laid yet at this lift: its place on the floor, dashed.
      const f = insideBrickFaces(s, { ...x, z1: x.z0 });
      ctx.setLineDash([3, 3]);
      fillPoly(ctx, f.top, null, c['ink-faint']);
      ctx.setLineDash([]);
      continue;
    }
    const writing = frame.writing?.path === x.path ? frame.writing : null;
    const grown = writing
      ? { ...x, z1: x.z1 + (x.z1 - x.z0) * Math.min(1, writing.lines / 60) }
      : x;
    const f = insideBrickFaces(s, grown);
    const open = frame.selected === x.path;
    const lit = frame.glow?.has(x.path) || frame.hover === x.path;
    const placing = frame.replay ? x.laidIn === frame.replay.k - 1 : false;
    const side = open ? c.folder : writing || placing ? c.harmony : c.glass;
    const lid = open ? c['folder-hi'] : writing || placing ? c.glow : c['glass-strong'];
    const edge = open ? c['folder-deep'] : lit ? c.accent : c['line-strong'];
    fillPoly(ctx, f.left, side, edge, lit || open ? 2 : 1);
    fillPoly(ctx, f.right, side, edge, lit || open ? 2 : 1);
    fillPoly(ctx, f.top, lid, edge, lit || open ? 2 : 1);
    const t = brickTop(s, grown);
    if (frame.signed?.has(x.path)) {
      ctx.fillStyle = c.positive;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const v = frame.verdicts?.[x.path];
    if (v && v !== 'pass') {
      ctx.fillStyle = c[BADGE_TONE[v]];
      ctx.beginPath();
      ctx.arc(f.top[1]!.x, f.top[1]!.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // The open brick's cables: to what it uses, and from what uses it.
  const open = frame.selected ? s.bricks.find((x) => x.path === frame.selected) : undefined;
  if (open && frame.links) {
    const from = brickTop(s, open);
    for (const [paths, color] of [
      [frame.links.imports, c.accent],
      [frame.links.importedBy, c.warning],
    ] as const)
      for (const p of paths) {
        const to = s.bricks.find((x) => x.path === p);
        if (!to || !standing(to)) continue;
        const end = brickTop(s, to);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo((from.x + end.x) / 2, Math.min(from.y, end.y) - 40, end.x, end.y);
        ctx.stroke();
      }
  }
  // The name of the brick under the pointer, or the open one.
  const named = s.bricks.find((x) => x.path === (frame.hover ?? frame.selected));
  if (named && standing(named)) {
    const t = brickTop(s, named);
    label(ctx, named.path.split('/').pop()!, t.x, t.y - 8, c.ink, pal, 12, 600);
  }
  // The audit's drones, and the beam onto the brick being scanned.
  if (frame.drones)
    frame.drones.at.forEach((d, i) => {
      const scan = frame.drones!.scan;
      const x = scan && scan.drone === i ? s.bricks.find((b) => b.path === scan.path) : undefined;
      if (x) {
        const t = insideBrickFaces(s, x).top;
        ctx.fillStyle = c.glow;
        poly(ctx, [d, t[1]!, t[3]!]);
        ctx.fill();
      }
      drone(ctx, d, pal);
    });
  // Its name under the front corner, clear of the code being written above.
  const foot = a(s.w, s.d, 0);
  label(ctx, `${s.name} · inside`, foot.x, foot.y + 30, c.ink, pal, 16, 700);
}

/**
 * The code being written, over its brick inside the building: a glass card with the lines around the one
 * typing in (JetBrains Mono, the only place in the picture it is used), a caret on it, falling lines struck
 * through, and a leader down to the brick, which glows. `lines` is typedAt's frame (typing.ts).
 */
export function drawCodeWindow(
  ctx: CanvasRenderingContext2D,
  s: InsideScene,
  path: string,
  lines: TypedLine[],
  pal: Palette,
  rows = 8,
): void {
  const x = s.bricks.find((b) => b.path === path);
  if (!x) return;
  const c = pal.color;
  const w = codeWindow(lines, rows);
  const at = brickTop(s, x);
  const LINE = 16;
  const W = 380;
  const H = 30 + rows * LINE + 8;
  // Above the brick, kept inside the picture.
  const left = Math.max(8, Math.min(s.width - W - 8, at.x - W / 2));
  const top = Math.max(8, at.y - H - 40);
  ctx.strokeStyle = c.harmony;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(Math.max(left + 12, Math.min(left + W - 12, at.x)), top + H);
  ctx.stroke();
  ctx.fillStyle = c['glass-strong'];
  ctx.strokeStyle = c.harmony;
  ctx.beginPath();
  ctx.roundRect(left, top, W, H, 10);
  ctx.fill();
  ctx.stroke();
  ctx.font = `600 12px ${pal.sans}`;
  ctx.fillStyle = c.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Being written: ${path}`, left + 12, top + 15, W - 24);
  ctx.font = `400 12px "JetBrains Mono", ui-monospace, monospace`;
  w.lines.forEach((l, i) => {
    const y = top + 30 + i * LINE + LINE / 2;
    if (l.state === 'typing' || l.state === 'typed') {
      ctx.fillStyle = c['accent-soft'];
      ctx.fillRect(left + 6, y - LINE / 2, W - 12, LINE);
    }
    ctx.fillStyle = c['ink-faint'];
    ctx.textAlign = 'right';
    ctx.fillText(String(w.from + i), left + 38, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = l.state === 'falling' ? c.negative : c.ink;
    ctx.globalAlpha = l.state === 'falling' ? 1 - l.progress * 0.8 : 1;
    const text = l.shown.length > 44 ? `${l.shown.slice(0, 43)}…` : l.shown;
    ctx.fillText(text, left + 46, y);
    if (l.state === 'falling') {
      const tw = ctx.measureText(text).width;
      ctx.fillRect(left + 46, y, tw, 1);
    }
    ctx.globalAlpha = 1;
    if (i === w.active && l.state === 'typing') {
      ctx.fillStyle = c.harmony;
      ctx.fillRect(left + 46 + ctx.measureText(text).width + 1, y - 7, 7, 14);
    }
  });
}
