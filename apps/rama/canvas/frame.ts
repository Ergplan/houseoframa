// frame(state) → everything visible at one instant of the replay, as plain data. draw() only paints a
// frame, so what the building shows is tested here without a canvas.
import type { Blueprint } from '@rama/shared';
import { layout, type BrickBox, type FloorBox, type Scene } from './layout.ts';
import {
  activeEvent,
  brickState,
  currentTime,
  localHour,
  timeline,
  type LiftEvent,
  type Timeline,
} from './timeline.ts';
import { IMPORTED_BY, IMPORTS } from './palette.ts';

export type Verdict = 'pass' | 'note' | 'defect';

export interface SiteState {
  blueprint: Blueprint;
  /** 0 = cleared site; k = lift k (1-based). */
  commitIndex: number;
  /** Progress within the lift, 0–1. */
  progress: number;
  /** The selected brick's path. */
  selection: string | null;
  /** Paths outlined with a pulse (a screen's bricks, a search hit). */
  glow: ReadonlySet<string>;
  /** Auditor verdicts per brick (Stage 5); null when no audit is shown. */
  audit: { verdicts: Record<string, Verdict> } | null;
  hover?: string | null;
  /** Draw import cables for the hovered or selected brick. */
  links?: boolean;
  /** Animation clock in ms for pulses and the JCB's arm; does not change what is built. */
  clock?: number;
}

export interface SiteModel {
  scene: Scene;
  timeline: Timeline;
}

const cache = new WeakMap<Blueprint, SiteModel>();

/** The scene and timeline of a Blueprint, computed once per Blueprint object. */
export function siteModel(bp: Blueprint): SiteModel {
  let m = cache.get(bp);
  if (!m) {
    const scene = layout(bp);
    m = { scene, timeline: timeline(bp, scene) };
    cache.set(bp, m);
  }
  return m;
}

export interface Sky {
  top: string;
  bottom: string;
  /** 0 by day, 1 at night: stars and lit windows. */
  night: number;
  sun: { x: number; y: number } | null;
  hour: number;
}

const SKY_KEYS: [number, string, string][] = [
  [0, '#0b1026', '#1b2440'],
  [5, '#141a3c', '#2c2f5a'],
  [6.5, '#3a4f96', '#f2a77a'],
  [8, '#3f6fb8', '#9fc4ea'],
  [16, '#3f6fb8', '#9fc4ea'],
  [18, '#2b1f4e', '#ff7a3d'],
  [19.5, '#16123a', '#4a2a5a'],
  [21, '#0b1026', '#1b2440'],
  [24, '#0b1026', '#1b2440'],
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(',')})`;
}

/** Sky colours for a local hour of day. */
export function skyAt(hour: number, scene: Scene): Sky {
  const i = SKY_KEYS.findIndex(([h], j) => hour >= h && hour < SKY_KEYS[j + 1]![0]);
  const [h0, t0, b0] = SKY_KEYS[i]!;
  const [h1, t1, b1] = SKY_KEYS[i + 1]!;
  const t = (hour - h0) / (h1 - h0);
  const night =
    hour < 5 || hour >= 21 ? 1 : hour < 8 ? (8 - hour) / 3 : hour >= 18 ? (hour - 18) / 3 : 0;
  const sun =
    hour >= 6 && hour <= 18.5
      ? (() => {
          const f = (hour - 6) / 12.5;
          return {
            x: 120 + f * (scene.width - 240),
            y: scene.ground - 40 - Math.sin(Math.PI * f) * (scene.ground - 120),
          };
        })()
      : null;
  return {
    top: mix(t0, t1, t),
    bottom: mix(b0, b1, t),
    night: Math.min(1, Math.max(0, night)),
    sun,
    hour,
  };
}

export interface FrameBrick {
  box: BrickBox;
  state: 'built' | 'placing';
  /** The brick changed by the event under way. */
  change?: { kind: 'modify' | 'demolish'; tag: string };
  verdict?: Verdict;
}

export interface Frame {
  scene: Scene;
  sky: Sky;
  cleared: boolean;
  floors: { floor: FloorBox; built: number; total: number }[];
  bricks: FrameBrick[];
  /** A brick on its way down from the crane hook. */
  hook: { x: number; y: number; box: BrickBox; crane: number } | null;
  /** Index of the crane whose builder made the current lift. */
  activeCrane: number | null;
  /** The JCB parks at the left; it drives to a brick whenever a lift knocks 20 or more lines out of it. */
  jcb: { x: number; busy: boolean; arm: number };
  dust: { x: number; y: number; color: string }[];
  banner: string | null;
  complete: boolean;
  door: boolean;
  cables: { from: BrickBox; to: BrickBox; color: string }[];
  glow: BrickBox[];
  selected: BrickBox | null;
  time: { ms: number; offset: number } | null;
  event: LiftEvent | null;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function frame(state: SiteState): Frame {
  const bp = state.blueprint;
  const { scene, timeline: tl } = siteModel(bp);
  const k = Math.max(0, Math.min(tl.lifts.length, state.commitIndex));
  const p = Math.max(0, Math.min(1, state.progress));
  const lift = k ? tl.lifts[k - 1]! : null;
  const ev = activeEvent(tl, k, p);
  const time = currentTime(tl, k, p);
  const first = tl.lifts[0];
  const hour = time
    ? localHour(time)
    : first
      ? localHour({ ms: first.ms - 15 * 60_000, offset: first.offset })
      : 10;
  const visible = (path: string) => brickState(tl, path, k, p);

  const bricks: FrameBrick[] = [];
  for (const box of scene.bricks) {
    const st = visible(box.path);
    if (st !== 'built') continue;
    const fb: FrameBrick = { box, state: 'built' };
    if (ev && ev.path === box.path && ev.kind !== 'add') {
      const tag = `${ev.add ? `+${ev.add}` : ''}${ev.del ? ` −${ev.del}` : ''}`.trim();
      fb.change = { kind: ev.kind, tag };
    }
    const v = state.audit?.verdicts[box.path];
    if (v) fb.verdict = v;
    bricks.push(fb);
  }

  const activeCrane = lift ? craneFor(scene, lift.author) : null;
  let hook: Frame['hook'] = null;
  if (ev && ev.kind === 'add' && activeCrane !== null) {
    const box = scene.byPath.get(ev.path)!;
    const t = (p - ev.t0) / (ev.t1 - ev.t0);
    const jibY = scene.top - 70;
    hook = { x: box.x + box.w / 2, y: jibY + (box.y - jibY) * ease(t), box, crane: activeCrane };
  }

  const demolishing = ev?.kind === 'demolish' ? scene.byPath.get(ev.path)! : null;
  const jcb = demolishing
    ? {
        x: Math.min(scene.width - 80, Math.max(0, demolishing.x + demolishing.w / 2 - 70)),
        busy: true,
        arm: Math.abs(Math.sin(((state.clock ?? 0) / 1000) * 6)),
      }
    : { x: 40, busy: false, arm: 0 };
  const dust = demolishing
    ? Array.from({ length: 12 }, (_, i) => {
        const f = (((p - ev!.t0) / (ev!.t1 - ev!.t0)) * 3 + i / 12) % 1;
        return {
          x: demolishing.x + ((i * 37) % Math.max(1, demolishing.w)),
          y: demolishing.y + demolishing.h + f * (scene.ground - demolishing.y - demolishing.h),
          color: demolishing.color,
        };
      })
    : [];

  const focus = state.selection ?? (state.links ? (state.hover ?? null) : null);
  const cables: Frame['cables'] = [];
  if (focus && scene.byPath.has(focus)) {
    const me = scene.byPath.get(focus)!;
    for (const e of bp.edges) {
      if (e.from === focus && e.to !== focus && visible(e.to) === 'built') {
        cables.push({ from: me, to: scene.byPath.get(e.to)!, color: IMPORTS });
      } else if (e.to === focus && visible(e.from) === 'built') {
        cables.push({ from: scene.byPath.get(e.from)!, to: me, color: IMPORTED_BY });
      }
    }
  }

  const builtSet = new Set(bricks.map((b) => b.box.path));
  return {
    scene,
    sky: skyAt(hour, scene),
    cleared: k === 0,
    floors: scene.floors.map((floor) => ({
      floor,
      built: floor.paths.filter((x) => builtSet.has(x)).length,
      total: floor.paths.length,
    })),
    bricks,
    hook,
    activeCrane,
    jcb,
    dust,
    banner:
      lift && !state.audit
        ? `COMMIT ${k}/${tl.lifts.length}  ${lift.short}  ${lift.subject.toUpperCase().slice(0, 52)}`
        : null,
    complete: tl.lifts.length > 0 && k === tl.lifts.length && p >= 1,
    door: k >= 1,
    cables,
    glow: [...state.glow].filter((x) => builtSet.has(x)).map((x) => scene.byPath.get(x)!),
    selected:
      state.selection && builtSet.has(state.selection) ? scene.byPath.get(state.selection)! : null,
    time,
    event: ev,
  };
}

function craneFor(scene: Scene, author: string): number {
  const i = scene.cranes.findIndex((c) => c.author === author);
  return i === -1 ? scene.cranes.length - 1 : i; // a builder without a crane of their own shares the last one
}
