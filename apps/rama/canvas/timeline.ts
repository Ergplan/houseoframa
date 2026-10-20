// The replay. Each commit is a lift; within a lift every changed brick gets an equal slot of progress,
// lower floors first. commitIndex 0 is the cleared site; commitIndex k (1-based) with progress p in
// [0, 1] is "lift k, a fraction p done". The sky's time of day comes from the commit timestamps, read in
// the commit's own time zone, so the same Blueprint replays the same on every machine.
// Ported from the weekend prototype (reference/weekend-prototype/house-of-rama.html, "timeline model").
import type { Blueprint } from '@rama/shared';
import { demolitions } from '@rama/blueprint/metrics';
import type { Scene } from './layout.ts';

export type EventKind = 'add' | 'modify' | 'demolish';

export interface LiftEvent {
  path: string;
  kind: EventKind;
  add: number | null;
  del: number | null;
  t0: number;
  t1: number;
}

export interface Lift {
  sha: string;
  short: string;
  at: string;
  author: string;
  subject: string;
  /** Milliseconds since the epoch. */
  ms: number;
  /** Minutes east of UTC, from the commit's own timestamp. */
  offset: number;
  events: LiftEvent[];
}

export interface Timeline {
  lifts: Lift[];
  /** 0-based lift that laid each brick; -1 when the brick is not in the history (laid after the last lift). */
  laidIn: Map<string, number>;
}

export function offsetMinutes(iso: string): number {
  const m = /([+-])(\d\d):?(\d\d)$/.exec(iso);
  if (!m) return 0; // "Z" or no zone
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

export function timeline(bp: Blueprint, scene: Scene): Timeline {
  const floorOf = new Map(scene.floors.flatMap((f, i) => f.paths.map((p) => [p, i] as const)));
  const nodes = new Map(bp.nodes.map((n) => [n.path, n]));
  const knocked = new Set(demolitions(bp).map((d) => `${d.sha}\0${d.path}`));
  const lifts = bp.commits.map((c): Lift => {
    const changes = c.changes
      .filter((ch) => nodes.has(ch.path) && scene.byPath.has(ch.path))
      .sort(
        (a, b) =>
          floorOf.get(a.path)! - floorOf.get(b.path)! ||
          scene.byPath.get(a.path)!.y - scene.byPath.get(b.path)!.y ||
          scene.byPath.get(a.path)!.x - scene.byPath.get(b.path)!.x,
      );
    const events = changes.map((ch, i): LiftEvent => ({
      path: ch.path,
      kind:
        nodes.get(ch.path)!.firstCommit === c.sha
          ? 'add'
          : knocked.has(`${c.sha}\0${ch.path}`)
            ? 'demolish'
            : 'modify',
      add: ch.add,
      del: ch.del,
      t0: i / changes.length,
      t1: (i + 1) / changes.length,
    }));
    return {
      sha: c.sha,
      short: c.short,
      at: c.at,
      author: c.author,
      subject: c.subject,
      ms: Date.parse(c.at),
      offset: offsetMinutes(c.at),
      events,
    };
  });
  const index = new Map(lifts.map((l, i) => [l.sha, i]));
  const laidIn = new Map(bp.nodes.map((n) => [n.path, index.get(n.firstCommit) ?? -1]));
  return { lifts, laidIn };
}

export type BrickState = 'none' | 'placing' | 'built';

export function brickState(tl: Timeline, path: string, k: number, p: number): BrickState {
  const fi = tl.laidIn.get(path);
  if (fi === undefined) return 'none';
  const n = tl.lifts.length;
  if (fi === -1) return k >= n && p >= 1 ? 'built' : 'none';
  if (k <= fi) return 'none';
  if (k === fi + 1) {
    const e = tl.lifts[fi]!.events.find((x) => x.path === path);
    if (e && p < e.t0) return 'none';
    if (e && p < e.t1) return 'placing';
  }
  return 'built';
}

/** The event under way in lift k at progress p, if any. */
export function activeEvent(tl: Timeline, k: number, p: number): LiftEvent | null {
  if (k < 1 || k > tl.lifts.length || p >= 1) return null;
  return tl.lifts[k - 1]!.events.find((e) => p >= e.t0 && p < e.t1) ?? null;
}

/** The clock during the replay: between the previous lift and this one; null on the cleared site. */
export function currentTime(
  tl: Timeline,
  k: number,
  p: number,
): { ms: number; offset: number } | null {
  if (k < 1 || k > tl.lifts.length) return null;
  const lift = tl.lifts[k - 1]!;
  const prev = k > 1 ? tl.lifts[k - 2]!.ms : lift.ms - 15 * 60_000;
  return { ms: prev + (lift.ms - prev) * Math.min(1, Math.max(0, p)), offset: lift.offset };
}

/** Local hour of day (0–24) at that instant, in the commit's own time zone. */
export function localHour(t: { ms: number; offset: number }): number {
  const minutes = Math.floor(t.ms / 60_000) + t.offset;
  return (((minutes % 1440) + 1440) % 1440) / 60;
}

/** "17:41" in the commit's own zone, and the zone as "+05:30". */
export function clockText(t: { ms: number; offset: number }): string {
  const h = localHour(t);
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.floor((h % 1) * 60 + 1e-6)).padStart(2, '0');
  const sign = t.offset < 0 ? '-' : '+';
  const off = Math.abs(t.offset);
  return `${hh}:${mm} UTC${sign}${String(Math.floor(off / 60)).padStart(2, '0')}:${String(off % 60).padStart(2, '0')}`;
}
