// The numbers. One function per figure, each a pure function of a Blueprint (Invariant 7): the campus,
// the inspector and the audit report display these and never recount.
import type { Blueprint, BrickNode, Commit } from '@rama/shared';
import { isCode } from '../files.ts';
import { byString } from '../json.ts';

export interface Ranked {
  path: string;
  count: number;
}

const rank = (counts: Map<string, number>, top: number): Ranked[] =>
  [...counts]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || byString(a.path, b.path))
    .slice(0, top);

/** Tracked files (bricks). */
export const files = (bp: Blueprint): number => bp.nodes.length;

/** Lines across all text bricks, lockfiles included. */
export const textLines = (bp: Blueprint): number =>
  bp.nodes.reduce((sum, n) => sum + (n.binary ? 0 : n.lines), 0);

/** Test bricks. */
export const tests = (bp: Blueprint): number => bp.nodes.filter((n) => n.test).length;

/** Commits in the extracted history. */
export const commits = (bp: Blueprint): number => bp.commits.length;

/** Distinct commit author names. */
export const authors = (bp: Blueprint): string[] =>
  [...new Set(bp.commits.map((c) => c.author))].sort(byString);

/** Branches. */
export const branches = (bp: Blueprint): number => bp.branches.length;

/** Import edges that import at least one name: the dependencies a reviewer reads in English. */
export const importEdges = (bp: Blueprint): number => bp.edges.filter((e) => e.symbols.length > 0).length;

/** Side-effect imports (`import './x.css'`): an edge that brings in a file but no names. */
export const sideEffectImports = (bp: Blueprint): number =>
  bp.edges.filter((e) => e.symbols.length === 0).length;

/** Distinct environment variable names read anywhere. */
export const envVars = (bp: Blueprint): string[] =>
  [...new Set(bp.nodes.flatMap((n) => n.env))].sort(byString);

/** Code bricks (not tests) that no test brick imports directly. */
export const untestedBricks = (bp: Blueprint): string[] => {
  const testPaths = new Set(bp.nodes.filter((n) => n.test).map((n) => n.path));
  const tested = new Set(bp.edges.filter((e) => testPaths.has(e.from)).map((e) => e.to));
  return bp.nodes
    .filter((n) => !n.test && isCode(n.path) && !tested.has(n.path))
    .map((n) => n.path)
    .sort(byString);
};

/** Bricks with the most distinct importers. */
export const loadBearing = (bp: Blueprint, top = 5): Ranked[] => {
  const counts = new Map<string, number>();
  for (const e of bp.edges) counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  return rank(counts, top);
};

/** Bricks changed by the most commits. */
export const mostReworked = (bp: Blueprint, top = 5): Ranked[] =>
  rank(new Map(bp.nodes.map((n) => [n.path, n.changes])), top);

/** The code brick with the most lines (stylesheets, documents and lockfiles are not code). */
export const heaviestCodeBrick = (bp: Blueprint): BrickNode | null =>
  bp.nodes
    .filter((n) => isCode(n.path) && !n.binary)
    .sort((a, b) => b.lines - a.lines || byString(a.path, b.path))[0] ?? null;

export interface Demolition {
  /** 1-based position of the commit in the history (oldest is 1). */
  commit: number;
  sha: string;
  path: string;
  deleted: number;
}

/** Changes that delete at least `minDeleted` lines from one file (the JCB on the building). */
export const demolitions = (bp: Blueprint, minDeleted = 20): Demolition[] =>
  bp.commits.flatMap((c, i) =>
    c.changes
      .filter((ch) => (ch.del ?? 0) >= minDeleted)
      .map((ch) => ({ commit: i + 1, sha: c.sha, path: ch.path, deleted: ch.del! })),
  );

export interface BrickFigures {
  /** Distinct bricks this brick imports. */
  dependsOn: number;
  /** Distinct bricks that import this brick. */
  usedBy: number;
  /** Whether a test brick imports it directly; null when that does not apply (a test, or not code). */
  tested: boolean | null;
}

/** Per brick: what it needs, what relies on it, and whether a test stands behind it. */
export const brickFigures = (bp: Blueprint): Record<string, BrickFigures> => {
  const untested = new Set(untestedBricks(bp));
  const out: Record<string, BrickFigures> = {};
  for (const n of bp.nodes) {
    out[n.path] = { dependsOn: 0, usedBy: 0, tested: n.test || !isCode(n.path) ? null : !untested.has(n.path) };
  }
  for (const e of bp.edges) {
    if (out[e.from]) out[e.from]!.dependsOn++;
    if (out[e.to]) out[e.to]!.usedBy++;
  }
  return out;
};

/** Code bricks (not tests) with a test brick importing them directly, over all such code bricks. */
export const testCoverage = (bp: Blueprint): { tested: number; of: number } => {
  const of = bp.nodes.filter((n) => !n.test && isCode(n.path)).length;
  return { tested: of - untestedBricks(bp).length, of };
};

/** Minutes from the first commit to the last. */
export const historySpan = (bp: Blueprint): number => {
  if (bp.commits.length < 2) return 0;
  return Math.round((Date.parse(bp.commits.at(-1)!.at) - Date.parse(bp.commits[0]!.at)) / 60_000);
};

/** Lines a commit added and deleted, and how many test bricks it laid. */
export const commitTotals = (bp: Blueprint, c: Commit): { add: number; del: number; testsAdded: number } => {
  const tests = new Set(bp.nodes.filter((n) => n.test).map((n) => n.path));
  return {
    add: c.changes.reduce((s, x) => s + (x.add ?? 0), 0),
    del: c.changes.reduce((s, x) => s + (x.del ?? 0), 0),
    testsAdded: c.changes.filter((x) => x.kind === 'A' && tests.has(x.path)).length,
  };
};

/** Every figure at once, for the CLI summary and the trust report. */
export const summary = (bp: Blueprint) => ({
  files: files(bp),
  textLines: textLines(bp),
  tests: tests(bp),
  commits: commits(bp),
  authors: authors(bp).length,
  branches: branches(bp),
  importEdges: importEdges(bp),
  sideEffectImports: sideEffectImports(bp),
  envVars: envVars(bp).length,
  untestedBricks: untestedBricks(bp).length,
  loadBearing: loadBearing(bp, 1)[0] ?? null,
  mostReworked: mostReworked(bp, 1)[0] ?? null,
  heaviestCodeBrick: heaviestCodeBrick(bp)?.path ?? null,
});
