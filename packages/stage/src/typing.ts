// Code typed in as it is written (Stage 11). A file's change, from what it held to what it holds, is a
// line diff: lines kept stay, deleted lines fall out first, then the added lines type in one after
// another. The typing goes at the builder's pace but never faster than a person can read a line
// (READ_MS); "catch up" jumps to the end. Pure and deterministic: the same change and the same moment
// give the same frame. A live lift and a replayed commit are the same: a before and an after.

/** A person reads a line of code in about this long at the least. */
export const READ_MS = 700;
/** A deleted line takes this long to fall out. */
export const FALL_MS = 250;

export interface FileChange {
  path: string;
  /** What the file held before; null for a new file. */
  before: string | null;
  /** What it holds after; null for a file deleted. */
  after: string | null;
}

export type Op =
  { op: 'keep'; text: string } | { op: 'add'; text: string } | { op: 'del'; text: string };

const linesOf = (s: string | null) =>
  s === null || s === '' ? [] : s.replace(/\n$/, '').split('\n');

/** The line diff (longest common subsequence), in the file's order. */
export function lineDiff(before: string | null, after: string | null): Op[] {
  const a = linesOf(before);
  const b = linesOf(after);
  const n = a.length;
  const m = b.length;
  // Lines in common at both ends first, so a large file with a small change stays cheap.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const mid: Op[] = [];
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      L[i]![j] = A[i] === B[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  let i = 0;
  let j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      mid.push({ op: 'keep', text: A[i]! });
      i++;
      j++;
    } else if (j < B.length && (i >= A.length || L[i]![j + 1]! >= L[i + 1]![j]!)) {
      mid.push({ op: 'add', text: B[j]! });
      j++;
    } else {
      mid.push({ op: 'del', text: A[i]! });
      i++;
    }
  }
  return [
    ...a.slice(0, start).map((text) => ({ op: 'keep' as const, text })),
    ...mid,
    ...a.slice(endA).map((text) => ({ op: 'keep' as const, text })),
  ];
}

export interface TypedLine {
  text: string;
  /** What is on screen of it now: all of it, part of it while it types, or fading while it falls. */
  shown: string;
  state: 'kept' | 'typed' | 'typing' | 'falling';
  /** 0–1 through its typing or its fall. */
  progress: number;
}

export interface TypingPlan {
  path: string;
  ops: Op[];
  /** How long each added line takes to type, at the least READ_MS. */
  lineMs: number;
  /** When the deletions have fallen and the typing starts. */
  typeFrom: number;
  /** When the last line is typed: the change is caught up. */
  total: number;
  added: number;
  deleted: number;
}

/**
 * The plan for typing one change. `paceMs` is how long the builder took over it (live), spread over the
 * added lines but never under READ_MS a line; in replay there is no pace, and the floor is the pace.
 */
export function typingPlan(change: FileChange, paceMs = 0): TypingPlan {
  const ops = lineDiff(change.before, change.after);
  const added = ops.filter((o) => o.op === 'add').length;
  const deleted = ops.filter((o) => o.op === 'del').length;
  const lineMs = Math.max(READ_MS, added ? Math.round(paceMs / added) : 0);
  const typeFrom = deleted ? FALL_MS : 0;
  return {
    path: change.path,
    ops,
    lineMs,
    typeFrom,
    total: typeFrom + added * lineMs,
    added,
    deleted,
  };
}

/** What the file looks like `ms` into the plan. Infinity (or catch up) gives the file as it is after. */
export function typedAt(plan: TypingPlan, ms: number): TypedLine[] {
  const out: TypedLine[] = [];
  let k = 0; // added lines met so far
  for (const o of plan.ops) {
    if (o.op === 'keep') out.push({ text: o.text, shown: o.text, state: 'kept', progress: 1 });
    else if (o.op === 'del') {
      if (ms < plan.typeFrom)
        out.push({ text: o.text, shown: o.text, state: 'falling', progress: ms / plan.typeFrom });
    } else {
      const start = plan.typeFrom + k * plan.lineMs;
      k++;
      if (ms < start) continue; // not typed yet: not on screen
      const p = Math.min(1, (ms - start) / plan.lineMs);
      out.push(
        p >= 1
          ? { text: o.text, shown: o.text, state: 'typed', progress: 1 }
          : {
              text: o.text,
              shown: o.text.slice(0, Math.ceil(o.text.length * p)),
              state: 'typing',
              progress: p,
            },
      );
    }
  }
  return out;
}

/**
 * The lines a small window over a brick shows: `rows` lines around the one being written (typing, else
 * falling, else the last typed), with the first one's line number. The whole file when it is short.
 */
export function codeWindow(
  lines: TypedLine[],
  rows = 8,
): { from: number; lines: TypedLine[]; active: number | null } {
  let active = lines.findIndex((l) => l.state === 'typing');
  if (active < 0) active = lines.findIndex((l) => l.state === 'falling');
  if (active < 0) active = lines.map((l) => l.state).lastIndexOf('typed');
  const at = active < 0 ? 0 : active;
  const from = Math.max(0, Math.min(at - Math.floor(rows / 2), lines.length - rows));
  return {
    from: from + 1,
    lines: lines.slice(from, from + rows),
    active: active < 0 ? null : active - from,
  };
}
