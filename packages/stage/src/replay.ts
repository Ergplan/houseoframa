// The replay over the Street. Each commit is a lift; within a lift every file it lays or changes on the
// Street gets an equal slot of progress, building by building, lower floors first. Lift 0 is the empty
// ground; lift k (1-based) at progress p in [0, 1] is "lift k, a fraction p done". The crane parks at the
// building being built. The clock reads each commit's own time zone, so the replay is the same on every
// machine.
import type { Blueprint, BrickNode } from '@rama/shared';
import type { Street } from './street.ts';

export interface StreetEvent {
  path: string;
  building: string;
  /** `lay` for a file this lift adds, `change` for one it changes. */
  kind: 'lay' | 'change';
  t0: number;
  t1: number;
}

export interface StreetLift {
  sha: string;
  at: string;
  author: string;
  subject: string;
  ms: number;
  /** Minutes east of UTC, from the commit's own timestamp. */
  offset: number;
  events: StreetEvent[];
  /** The building with the most work in this lift; null when the lift touched nothing on the Street. */
  busiest: string | null;
}

export interface StreetTimeline {
  lifts: StreetLift[];
  /** 0-based lift that laid each file on the Street; -1 for a file not yet in any lift. */
  laidIn: Map<string, number>;
}

export function offsetMinutes(iso: string): number {
  const m = /([+-])(\d\d):?(\d\d)$/.exec(iso);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** What the replay needs of a Blueprint: its history, and the lift that laid each file. */
export type History = Pick<Blueprint, 'commits'> & {
  nodes: Pick<BrickNode, 'path' | 'firstCommit'>[];
};

export function streetTimeline(bp: History, s: Pick<Street, 'buildings'>): StreetTimeline {
  const order = new Map<string, { b: number; z: number; building: string }>();
  s.buildings.forEach((b, bi) =>
    b.floors.forEach((f) =>
      f.bricks.forEach((x) => order.set(x.path, { b: bi, z: x.z0, building: b.id })),
    ),
  );
  const firstOf = new Map(bp.nodes.map((n) => [n.path, n.firstCommit]));
  const lifts = bp.commits.map((c): StreetLift => {
    const changed = [...new Set(c.changes.map((ch) => ch.path))]
      .filter((p) => order.has(p))
      .sort(
        (a, b) =>
          order.get(a)!.b - order.get(b)!.b ||
          order.get(a)!.z - order.get(b)!.z ||
          (a < b ? -1 : 1),
      );
    const events = changed.map((path, i): StreetEvent => ({
      path,
      building: order.get(path)!.building,
      kind: firstOf.get(path) === c.sha ? 'lay' : 'change',
      t0: i / changed.length,
      t1: (i + 1) / changed.length,
    }));
    const work = new Map<string, number>();
    for (const e of events) work.set(e.building, (work.get(e.building) ?? 0) + 1);
    const busiest = [...work].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
    return {
      sha: c.sha,
      at: c.at,
      author: c.author,
      subject: c.subject,
      ms: Date.parse(c.at),
      offset: offsetMinutes(c.at),
      events,
      busiest,
    };
  });
  const index = new Map(lifts.map((l, i) => [l.sha, i]));
  const laidIn = new Map([...order.keys()].map((p) => [p, index.get(firstOf.get(p) ?? '') ?? -1]));
  return { lifts, laidIn };
}

export type LaidState = 'none' | 'placing' | 'built';

/** Whether a file stands at lift k, progress p. */
export function laid(tl: StreetTimeline, path: string, k: number, p: number): LaidState {
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

/** The building the crane parks at during lift k at progress p: the one being worked on, else null. */
export function craneAt(tl: StreetTimeline, k: number, p: number): string | null {
  if (k < 1 || k > tl.lifts.length) return null;
  const lift = tl.lifts[k - 1]!;
  if (p >= 1) return lift.busiest;
  return lift.events.find((e) => p >= e.t0 && p < e.t1)?.building ?? lift.busiest;
}

/** "Lift 3 · 02:10": the live chip, in the commit's own time zone; null on the empty ground. */
export function liftChip(tl: StreetTimeline, k: number): string | null {
  if (k < 1 || k > tl.lifts.length) return null;
  const l = tl.lifts[k - 1]!;
  const minutes = Math.floor(l.ms / 60_000) + l.offset;
  const day = ((minutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(day / 60)).padStart(2, '0');
  const mm = String(day % 60).padStart(2, '0');
  return `Lift ${k} · ${hh}:${mm}`;
}

/** Local hour (0–24) of lift k, for the sky: night before six and after seven. */
export function hourOf(tl: StreetTimeline, k: number): number | null {
  if (k < 1 || k > tl.lifts.length) return null;
  const l = tl.lifts[k - 1]!;
  const minutes = Math.floor(l.ms / 60_000) + l.offset;
  return (((minutes % 1440) + 1440) % 1440) / 60;
}
