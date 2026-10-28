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
import { brickTop, insideAt, type InsideScene } from './inside.ts';
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
  const formulaIndex = flow.steps.findIndex((s) => s.kind === 'formula');
  const screenIndex = flow.steps.findIndex((s) => s.kind === 'screen');
  // The part that works the figure out; when it stands in another building, the ground under this one.
  const fnAt = brickAt(flow.steps[fnIndex]?.file ?? null) ?? ground;
  const pipes: Pipe[] = [];
  const stops: (Pt | null)[] = [];
  const dry = (i: number) => flow.steps[i]?.value === null;
  const label = (i: number, what: string) => (dry(i) ? `${what}: untraced` : null);
  // Every step has its own pipe; a step with no value is a dry, broken one, labelled (reviewer run 5).
  flow.steps.forEach((s, i) => {
    if (s.kind !== 'source') return;
    const from = brickAt(s.file) ?? brickAt(s.table ? tableFile(s.table) : null) ?? ground;
    stops[i] = from;
    const points =
      from === ground
        ? [ground, { x: ground.x, y: fnAt.y }, fnAt]
        : [from, { x: fnAt.x, y: from.y }, fnAt];
    pipes.push({ step: i, points, dry: dry(i), label: label(i, s.label) });
  });
  const top = { x: fnAt.x, y: Math.min(fnAt.y, figure?.y ?? fnAt.y) - 18 };
  const over = { x: figure?.x ?? fnAt.x, y: top.y };
  stops[fnIndex] = fnAt;
  stops[formulaIndex] = top;
  // Up from the part that works it out (the function), across as the formula is applied, down onto the
  // figure on the glass (the screen).
  pipes.push({
    step: fnIndex,
    points: [fnAt, top],
    dry: dry(fnIndex),
    label: label(fnIndex, 'worked out again'),
  });
  pipes.push({
    step: formulaIndex,
    points: [top, over],
    dry: dry(formulaIndex),
    label: label(formulaIndex, 'the formula'),
  });
  // The screen step always has its pipe (reviewer run 10): onto the figure, or up past the roof when
  // no face of this building shows it.
  if (screenIndex >= 0) {
    const end = figure ?? { x: over.x, y: over.y - 24 };
    stops[screenIndex] = end;
    pipes.push({
      step: screenIndex,
      points: [over, end],
      dry: dry(screenIndex),
      label: dry(screenIndex) ? 'untraced: no water reaches the screen' : null,
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
  const firstDry = Math.min(Infinity, ...layout.pipes.filter((p) => p.dry).map((p) => p.step));
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
    // The water stops at the first dry step: nothing runs past where the trail runs out (reviewer run 7).
    if (p.step > firstDry) continue;
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

/**
 * The pipes of one figure's flow inside a building (the third level): from the brick where an input is
 * kept (or the ground under the floors when it is kept elsewhere), to the brick that works the figure out,
 * up as the formula is applied, and across to the brick that shows it (`screenFile`, the screen's own
 * file). The same steps, the same dry pipes.
 */
export function insidePipes(
  sc: InsideScene,
  flow: FlowLike,
  tableFile: (table: string) => string | null,
  screenFile: string | null,
): PipeLayout {
  const brickAt = (file: string | null): Pt | null => {
    const x = file ? sc.bricks.find((b) => b.path === file) : undefined;
    return x ? brickTop(sc, x) : null;
  };
  const a = insideAt(sc);
  const ground = a(sc.w / 2, sc.d + 0.5, -24);
  const fnIndex = flow.steps.findIndex((s) => s.kind === 'function');
  const formulaIndex = flow.steps.findIndex((s) => s.kind === 'formula');
  const screenIndex = flow.steps.findIndex((s) => s.kind === 'screen');
  const fnAt = brickAt(flow.steps[fnIndex]?.file ?? null) ?? ground;
  const shows = brickAt(flow.steps[screenIndex]?.file ?? screenFile);
  const pipes: Pipe[] = [];
  const stops: (Pt | null)[] = [];
  const dry = (i: number) => flow.steps[i]?.value === null;
  const label = (i: number, what: string) => (dry(i) ? `${what}: untraced` : null);
  flow.steps.forEach((s, i) => {
    if (s.kind !== 'source') return;
    const from = brickAt(s.file) ?? brickAt(s.table ? tableFile(s.table) : null) ?? ground;
    stops[i] = from;
    pipes.push({
      step: i,
      points: [from, { x: from.x, y: Math.min(from.y, fnAt.y) - 14 }, fnAt],
      dry: dry(i),
      label: label(i, s.label),
    });
  });
  const top = { x: fnAt.x, y: Math.min(fnAt.y, shows?.y ?? fnAt.y) - 30 };
  const over = { x: shows?.x ?? fnAt.x, y: top.y };
  stops[fnIndex] = fnAt;
  stops[formulaIndex] = top;
  pipes.push({
    step: fnIndex,
    points: [fnAt, top],
    dry: dry(fnIndex),
    label: label(fnIndex, 'worked out again'),
  });
  pipes.push({
    step: formulaIndex,
    points: [top, over],
    dry: dry(formulaIndex),
    label: label(formulaIndex, 'the formula'),
  });
  // The screen step always has its pipe (reviewer run 10): onto the brick that shows the figure, or,
  // when no brick of this building does, up to the glass at the top of the building.
  if (screenIndex >= 0) {
    const glass = a(0, sc.d, sc.h + 20);
    const end = shows ?? { x: over.x, y: Math.min(over.y, glass.y) - 24 };
    stops[screenIndex] = end;
    pipes.push({
      step: screenIndex,
      points: [over, end],
      dry: dry(screenIndex),
      label: dry(screenIndex) ? 'untraced: no water reaches the screen' : null,
    });
  }
  return { pipes, stops };
}
