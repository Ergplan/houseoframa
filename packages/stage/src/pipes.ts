/// <reference lib="dom" />
// The trail drawn as plumbing (Stage 11), at the Building level: from where an input is kept (a part of
// the building, or the ground under it when it is kept elsewhere) along the floors to the part of the
// building that works the figure out, and up through the floors to the figure on the glass front. Pipes
// are drawn only for steps the trail has; a step with no value is a dry, broken pipe labelled untraced
// (Invariant 2). Water moves through them in slow motion, one step a second, the real values only.
// Pure and deterministic: the same scene, flow and moment give the same frame.
import type { BuildingScene } from './building.ts';
import { brickOnFace, facadeShape, floorFaceOf, subFace } from './geometry.ts';
import type { Pt } from './iso.ts';
import type { Palette } from './palette.ts';

/** A flow as packages/trace gives it (flowOf): what the pipes need of it. */
export interface FlowLike {
  key: string;
  steps: {
    kind: 'source' | 'function' | 'formula' | 'screen';
    label: string;
    file: string | null;
    table: string | null;
    value: string | null;
  }[];
}

export interface Pipe {
  /** The step whose water runs through it: it fills while that step plays. */
  step: number;
  points: Pt[];
  dry: boolean;
  /** For a dry pipe: what is untraced. */
  label: string | null;
}

export interface PipeLayout {
  pipes: Pipe[];
  /** Where each step's value shows while it plays: its brick, the ground, the figure. */
  stops: (Pt | null)[];
}

const mid = (pts: Pt[]): Pt => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

/**
 * The pipes of one figure's flow in a building. `tableFile` names the file a table is defined in (from
 * the Blueprint), so an input kept in a table starts at that part of the building when it stands here.
 */
export function buildingPipes(
  sc: BuildingScene,
  flow: FlowLike,
  tableFile: (table: string) => string | null,
): PipeLayout {
  const side = floorFaceOf(sc);
  const brickAt = (file: string | null): Pt | null => {
    if (!file) return null;
    for (const fl of sc.floors) {
      const x = fl.bricks.find((b) => b.path === file);
      if (x) return mid(brickOnFace(side, sc.h, x));
    }
    return null;
  };
  // The ground under the building, below the side face's middle.
  const groundFace = subFace(side, 0.5, 0.5, 1, 1);
  const ground = { x: groundFace[0]!.x, y: groundFace[0]!.y + 26 };
  // The figure on the glass front: its hotspot, or the bottom of its screen when the face does not show it.
  let figure: Pt | null = null;
  for (const p of sc.facades)
    for (const g of p.figures)
      if (g.key === flow.key)
        figure = g.at
          ? mid(facadeShape(sc, g.at.u0, g.at.u1, g.at.v0, g.at.v1))
          : mid(facadeShape(sc, p.u0, p.u1, 0.96, 1));
  const fnIndex = flow.steps.findIndex((s) => s.kind === 'function');
  const fnStep = flow.steps[fnIndex]!;
  const fnAt = brickAt(fnStep.file);
  const pipes: Pipe[] = [];
  const stops: (Pt | null)[] = [];
  flow.steps.forEach((s, i) => {
    if (s.kind !== 'source') return;
    const from = brickAt(s.file) ?? brickAt(s.table ? tableFile(s.table) : null) ?? ground;
    stops[i] = from;
    if (!fnAt) return;
    // Along the floor from where it is kept, then up or down the side to the part that works it out.
    const corner = { x: fnAt.x, y: from.y };
    pipes.push({
      step: i,
      points: from === ground ? [ground, { x: ground.x, y: fnAt.y }, fnAt] : [from, corner, fnAt],
      dry: s.value === null,
      label: s.value === null ? `${s.label}: untraced` : null,
    });
  });
  stops[fnIndex] = fnAt;
  const formulaIndex = flow.steps.findIndex((s) => s.kind === 'formula');
  stops[formulaIndex] = fnAt;
  const screenIndex = flow.steps.findIndex((s) => s.kind === 'screen');
  stops[screenIndex] = figure;
  if (fnAt && figure) {
    // Up through the floors to the figure on the front.
    const top = { x: fnAt.x, y: Math.min(fnAt.y, figure.y) - 18 };
    pipes.push({
      step: screenIndex,
      points: [fnAt, top, { x: figure.x, y: top.y }, figure],
      dry: flow.steps[screenIndex]!.value === null,
      label:
        flow.steps[screenIndex]!.value === null ? 'untraced: no water reaches the screen' : null,
    });
  }
  return { pipes, stops };
}

/** Where the flow is at a moment: the step playing and how far through it, one step a second. */
export function flowAt(
  steps: number,
  ms: number,
  stepMs = 1000,
): { step: number; progress: number; done: boolean } {
  if (steps === 0) return { step: 0, progress: 1, done: true };
  const step = Math.min(steps - 1, Math.floor(ms / stepMs));
  const done = ms >= steps * stepMs;
  return { step, progress: done ? 1 : (ms - step * stepMs) / stepMs, done };
}

/** A point part-way along a polyline (0–1 of its length). */
export function along(points: Pt[], t: number): { at: Pt; upTo: Pt[] } {
  const seg = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let left = Math.max(0, Math.min(1, t)) * total;
  const upTo: Pt[] = [points[0]!];
  for (let i = 0; i < seg.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (left <= seg[i]!) {
      const k = seg[i]! ? left / seg[i]! : 0;
      const at = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      upTo.push(at);
      return { at, upTo };
    }
    left -= seg[i]!;
    upTo.push(b);
  }
  return { at: points.at(-1)!, upTo };
}

/**
 * Paints the pipes, and the water up to where the flow is: full in the steps already played, rising in
 * the one playing, none ahead. A dry pipe is drawn broken and grey with its label, and carries no water.
 */
export function drawPipes(
  ctx: CanvasRenderingContext2D,
  layout: PipeLayout,
  pal: Palette,
  at: { step: number; progress: number } | null,
): void {
  const c = pal.color;
  const path = (pts: Pt[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  };
  for (const p of layout.pipes) {
    // The pipe itself: a glass tube.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(p.dry ? [10, 8] : []);
    ctx.strokeStyle = p.dry ? c['ink-muted'] : c['line-strong'];
    ctx.lineWidth = 9;
    path(p.points);
    ctx.stroke();
    ctx.strokeStyle = c.canvas;
    ctx.lineWidth = 5;
    path(p.points);
    ctx.stroke();
    ctx.setLineDash([]);
    if (p.dry) {
      const m = along(p.points, 0.5).at;
      ctx.font = `600 11px ${pal.sans}`;
      ctx.fillStyle = c['ink-muted'];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.label ?? 'untraced', m.x, m.y - 8);
      continue;
    }
    if (!at) continue;
    const fill = p.step < at.step ? 1 : p.step === at.step ? at.progress : 0;
    if (fill <= 0) continue;
    const w = along(p.points, fill);
    ctx.strokeStyle = c.harmony;
    ctx.lineWidth = 5;
    path(w.upTo);
    ctx.stroke();
    ctx.fillStyle = c.glow;
    ctx.beginPath();
    ctx.arc(w.at.x, w.at.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}
