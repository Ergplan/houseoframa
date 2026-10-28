/// <reference lib="dom" />
// The trail drawn as plumbing (Stage 11), at the Building level (and along the Street's roads when it
// crosses buildings, `streetPipes`): from where an input is kept (a part of
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
import { at, type Street } from './street.ts';

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

type GroundPt = { gx: number; gy: number };

/** How many of these buildings a straight run over the ground passes through. */
export function runsThrough(
  buildings: Street['buildings'],
  a: GroundPt,
  b: GroundPt,
  skip: (string | null)[] = [],
): number {
  const [x0, x1] = [Math.min(a.gx, b.gx), Math.max(a.gx, b.gx)];
  const [y0, y1] = [Math.min(a.gy, b.gy), Math.max(a.gy, b.gy)];
  return buildings.filter(
    (q) =>
      !skip.includes(q.id) && x0 < q.gx + q.side && x1 > q.gx && y0 < q.gy + q.side && y1 > q.gy,
  ).length;
}

/**
 * The one turn a pipe takes over the ground where no road joins two places (a plot has none): on the
 * side that passes through fewer other buildings, the first when they tie.
 */
export function groundTurn(
  buildings: Street['buildings'],
  a: GroundPt,
  b: GroundPt,
  skip: (string | null)[] = [],
): GroundPt {
  const turns: [GroundPt, GroundPt] = [
    { gx: a.gx, gy: b.gy },
    { gx: b.gx, gy: a.gy },
  ];
  const cost = (t: GroundPt) =>
    runsThrough(buildings, a, t, skip) + runsThrough(buildings, t, b, skip);
  return cost(turns[1]) < cost(turns[0]) ? turns[1] : turns[0];
}

/** Where a step of a flow stands on the Street: a building, or a table's plot in the ground. */
export type StreetPlace = { building: string } | { table: string };

const placeKey = (p: StreetPlace) => ('building' in p ? `b:${p.building}` : `t:${p.table}`);

/**
 * Where each step of a flow stands on the Street. `ownerOf` names the building a file stands in;
 * `shownIn` is the building whose glass shows the figure. A source kept in a table stands on its plot,
 * one kept in a file on that file's building, and one kept elsewhere (the form, a file of no building)
 * nowhere: its water starts where the figure is worked out.
 */
export function flowPlaces(
  flow: FlowLike,
  ownerOf: (file: string) => string | null,
  shownIn: string,
): { steps: (StreetPlace | null)[]; crosses: boolean } {
  const fn = flow.steps.find((s) => s.kind === 'function');
  const fnOwner = fn?.file ? ownerOf(fn.file) : null;
  const steps = flow.steps.map((s): StreetPlace | null => {
    if (s.kind === 'source') {
      if (s.table) return { table: s.table };
      const owner = s.file ? ownerOf(s.file) : null;
      return owner ? { building: owner } : null;
    }
    if (s.kind === 'screen') return { building: shownIn };
    return { building: fnOwner ?? shownIn };
  });
  const distinct = new Set(steps.flatMap((p) => (p ? [placeKey(p)] : [])));
  return { steps, crosses: distinct.size > 1 };
}

/**
 * The pipes of one figure's flow along the Street (Stage 11), drawn when its trail crosses buildings:
 * from the plot or building where each input is kept, along the road between them (or straight over the
 * ground when no road joins them), to the building that works the figure out; up through that building
 * as it is worked out; across its roof as the formula is applied; and along the road to the building
 * whose glass shows it, up to the figure. The same steps and the same dry pipes as inside a building.
 * Null when the whole trail stays in one building: that flow is drawn at the Building level.
 */
export function streetPipes(
  s: Street,
  flow: FlowLike,
  ownerOf: (file: string) => string | null,
  shownIn: string,
): PipeLayout | null {
  const places = flowPlaces(flow, ownerOf, shownIn);
  if (!places.crosses) return null;
  const p = at(s);
  const foot = (pl: StreetPlace): { gx: number; gy: number; h: number } | null => {
    if ('table' in pl) {
      const x = s.plots.find((q) => q.table === pl.table);
      return x ? { gx: x.gx + x.w / 2, gy: x.gy + x.d / 2, h: 0 } : null;
    }
    const b = s.buildings.find((q) => q.id === pl.building);
    return b ? { gx: b.gx + b.side / 2, gy: b.gy + b.side / 2, h: b.height } : null;
  };
  const LIFT = 4;
  // The ground route from one place to another: the road between the two buildings when there is one.
  const route = (a: StreetPlace, b: StreetPlace): Pt[] => {
    const fa = foot(a);
    const fb = foot(b);
    if (!fa || !fb) return [];
    if (placeKey(a) === placeKey(b)) return [p(fa.gx, fa.gy, LIFT)];
    const ida = 'building' in a ? a.building : null;
    const idb = 'building' in b ? b.building : null;
    const road = s.roads.find(
      (r) => (r.from === ida && r.to === idb) || (r.from === idb && r.to === ida),
    );
    const mids = road
      ? road.from === ida
        ? road.points
        : [...road.points].reverse()
      : [groundTurn(s.buildings, fa, fb, [ida, idb])];
    return [p(fa.gx, fa.gy, LIFT), ...mids.map((m) => p(m.gx, m.gy, LIFT)), p(fb.gx, fb.gy, LIFT)];
  };
  const fnIndex = flow.steps.findIndex((x) => x.kind === 'function');
  const formulaIndex = flow.steps.findIndex((x) => x.kind === 'formula');
  const screenIndex = flow.steps.findIndex((x) => x.kind === 'screen');
  const works = places.steps[fnIndex] ?? { building: shownIn };
  const shows: StreetPlace = { building: shownIn };
  const wf = foot(works);
  const sf = foot(shows);
  if (!wf || !sf) return null;
  const dry = (i: number) => flow.steps[i]?.value === null;
  const label = (i: number, what: string) => (dry(i) ? `${what}: untraced` : null);
  const pipes: Pipe[] = [];
  const stops: (Pt | null)[] = [];
  flow.steps.forEach((x, i) => {
    if (x.kind !== 'source') return;
    const from = places.steps[i] ?? works;
    let points = route(from, works);
    // Kept where it is worked out: a short pipe into that building's foot, so the step still has its
    // pipe, its label when dry, and stops the water when it has no value.
    if (points.length === 1) points = [p(wf.gx - 1, wf.gy + 1, LIFT), points[0]!];
    stops[i] = points[0] ?? null;
    if (points.length > 1) pipes.push({ step: i, points, dry: dry(i), label: label(i, x.label) });
  });
  const roof = p(wf.gx, wf.gy, wf.h + 18);
  stops[fnIndex] = roof;
  pipes.push({
    step: fnIndex,
    points: [p(wf.gx, wf.gy, LIFT), roof],
    dry: dry(fnIndex),
    label: label(fnIndex, 'worked out'),
  });
  const over = p(wf.gx, wf.gy, wf.h + 40);
  stops[formulaIndex] = over;
  pipes.push({
    step: formulaIndex,
    points: [roof, over],
    dry: dry(formulaIndex),
    label: label(formulaIndex, 'how it is worked out'),
  });
  const glass = p(sf.gx, sf.gy, sf.h * 0.9);
  stops[screenIndex] = glass;
  pipes.push({
    step: screenIndex,
    points: [
      over,
      ...route(works, shows).slice(placeKey(works) === placeKey(shows) ? 1 : 0),
      glass,
    ],
    dry: dry(screenIndex),
    label: dry(screenIndex) ? 'untraced: no water reaches the screen' : null,
  });
  return { pipes, stops };
}
