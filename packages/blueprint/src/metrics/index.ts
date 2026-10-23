// The numbers. One function per figure, each a pure function of a Blueprint (Invariant 7): the campus,
// the inspector and the audit report display these and never recount.
import type { Blueprint, BrickNode, Commit, Screen } from '@rama/shared';
import { isCode } from '../files.ts';

export { isCode };
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

type Change = Commit['changes'][number];

export interface CommitBreakdown {
  /** Bricks this commit laid (their first commit). */
  laid: string[];
  /** Bricks it changed, short of knocking a wall out. */
  renovated: Change[];
  /** Bricks it deleted 20 or more lines from (the demolitions). */
  knockedOut: Change[];
  /** Files it touched that are no longer in the building. */
  gone: Change[];
}

/** One commit's changes, sorted the way the building shows them. */
export const commitBreakdown = (bp: Blueprint, c: Commit): CommitBreakdown => {
  const nodes = new Map(bp.nodes.map((n) => [n.path, n]));
  const knocked = new Set(demolitions({ ...bp, commits: [c] }).map((d) => d.path));
  const out: CommitBreakdown = { laid: [], renovated: [], knockedOut: [], gone: [] };
  for (const ch of c.changes) {
    const n = nodes.get(ch.path);
    if (!n) out.gone.push(ch);
    else if (n.firstCommit === c.sha) out.laid.push(ch.path);
    else if (knocked.has(ch.path)) out.knockedOut.push(ch);
    else out.renovated.push(ch);
  }
  return out;
};

export interface BrickHistory {
  entries: { index: number; sha: string; short: string; at: string; author: string; laid: boolean; add: number | null; del: number | null }[];
  /** 0-based commit that laid it; null when it is not in the extracted history. */
  laidIn: number | null;
  /** Commits that changed it after it was laid. */
  reworked: number;
}

/** Every commit that touched a brick, oldest first. */
export const brickHistory = (bp: Blueprint, path: string): BrickHistory => {
  const n = bp.nodes.find((x) => x.path === path);
  const entries = bp.commits.flatMap((c, index) => {
    const ch = c.changes.find((x) => x.path === path);
    return ch
      ? [{ index, sha: c.sha, short: c.short, at: c.at, author: c.author, laid: c.sha === n?.firstCommit, add: ch.add, del: ch.del }]
      : [];
  });
  const laid = entries.find((e) => e.laid);
  return { entries, laidIn: laid ? laid.index : null, reworked: laid ? entries.length - 1 : 0 };
};

/** The screens whose import closure holds this brick. */
export const screensOf = (bp: Blueprint, path: string): Screen[] => bp.screens.filter((s) => s.bricks.includes(path));

/** What a brick imports, grouped by the floor each import stands on, in floor order (unknown floors last). */
export const dependenciesByFloor = (bp: Blueprint, path: string): { layer: string; paths: string[] }[] => {
  const layerOf = new Map(bp.nodes.map((n) => [n.path, n.layer]));
  const groups = new Map<string, string[]>();
  for (const e of bp.edges) {
    if (e.from !== path) continue;
    const layer = layerOf.get(e.to) ?? 'unknown';
    groups.set(layer, [...(groups.get(layer) ?? []), e.to]);
  }
  const order = bp.layers.map((l) => l.id);
  return [...groups]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib) || byString(a, b);
    })
    .map(([layer, paths]) => ({ layer, paths }));
};

/** The captured screens (Stage 3; any list carrying each screen's bricks) that a brick helps render. */
export const screensRendering = <S extends { bricks: string[] }>(screens: S[], path: string): S[] =>
  screens.filter((s) => s.bricks.includes(path));

/** Screens signed (by id, at the Blueprint's commit; the caller decides which signatures are in force) over all screens. */
export const signatureCoverage = (bp: Blueprint, signedScreens: string[]): { signed: number; unsigned: number; of: number } => {
  const signed = bp.screens.filter((s) => signedScreens.includes(s.id)).length;
  return { signed, unsigned: bp.screens.length - signed, of: bp.screens.length };
};

export type BrickMark = 'red' | 'amber' | 'green';

/**
 * The dot on each code brick (tests and non-code have none). On a signed screen: green when a test stands
 * behind the brick, amber when only the signature does. Elsewhere: red when no test stands behind it.
 */
export const brickMarks = (bp: Blueprint, signedScreens: string[]): Record<string, BrickMark> => {
  const figures = brickFigures(bp);
  const signed = new Set(bp.screens.filter((s) => signedScreens.includes(s.id)).flatMap((s) => s.bricks));
  const out: Record<string, BrickMark> = {};
  for (const [path, f] of Object.entries(figures)) {
    if (f.tested === null) continue;
    if (signed.has(path)) out[path] = f.tested ? 'green' : 'amber';
    else if (!f.tested) out[path] = 'red';
  }
  return out;
};

export type AuditVerdict = 'pass' | 'note' | 'defect';

/**
 * An audit's totals over a Blueprint (Stage 5): defect and note findings, and the bricks no finding
 * flags. The audit report, the auditor's input and the app all show these numbers, from here.
 */
export const auditCounts = (bp: Blueprint, findings: { brick: string; verdict: AuditVerdict }[]) => {
  const flagged = new Set(findings.filter((f) => f.verdict !== 'pass').map((f) => f.brick));
  return {
    defects: findings.filter((f) => f.verdict === 'defect').length,
    notes: findings.filter((f) => f.verdict === 'note').length,
    passes: bp.nodes.filter((n) => !flagged.has(n.path)).length,
    bricks: bp.nodes.length,
  };
};

/** Sign-offs an audit confirmed and rejected, of all it judged (the report panel's figure). */
export const auditSignoffCounts = (signoffs: { confirmed: boolean }[]) => ({
  confirmed: signoffs.filter((s) => s.confirmed).length,
  rejected: signoffs.filter((s) => !s.confirmed).length,
  of: signoffs.length,
});

/** An audit's totals per floor: bricks on it, defects and notes on its bricks. */
export const auditFloorCounts = (bp: Blueprint, findings: { brick: string; verdict: AuditVerdict }[]) => {
  const layerOf = new Map(bp.nodes.map((n) => [n.path, n.layer]));
  return bp.layers.map((l) => ({
    id: l.id,
    label: l.label,
    bricks: bp.nodes.filter((n) => n.layer === l.id).length,
    defects: findings.filter((f) => f.verdict === 'defect' && layerOf.get(f.brick) === l.id).length,
    notes: findings.filter((f) => f.verdict === 'note' && layerOf.get(f.brick) === l.id).length,
  }));
};

export type PodLight = 'off' | 'blue' | 'amber' | 'green' | 'pink';

export interface PodBooking {
  pod: number;
  siteId: string | null;
  personId: string;
  shift: 'work' | 'game';
  startsAt: string;
  endsAt: string;
}

/** The booking of a pod at a moment, if any: starts at or before it, ends after it. */
export const activeBooking = <B extends PodBooking>(bookings: B[], pod: number, at: Date): B | null =>
  bookings.find((b) => b.pod === pod && Date.parse(b.startsAt) <= at.getTime() && at.getTime() < Date.parse(b.endsAt)) ?? null;

/** Two bookings of one pod overlap when each starts before the other ends. */
export const overlaps = (a: Pick<PodBooking, 'pod' | 'startsAt' | 'endsAt'>, b: Pick<PodBooking, 'pod' | 'startsAt' | 'endsAt'>) =>
  a.pod === b.pod && Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

/**
 * The pod's light (Stage 6): off with no booking; pink in game mode; for work on a site, green when every
 * screen is signed at the Blueprint's commit and that commit's audit found no defect; amber (awaiting
 * sign-off) when the screens are photographed at that commit and one is not signed there; blue otherwise:
 * work in progress, the code ahead of its photographs.
 */
export function podLight(input: {
  booking: Pick<PodBooking, 'shift' | 'siteId'> | null;
  bp: Blueprint | null;
  signedScreens: string[];
  capturedCommit: string | null;
  audit: { commit: string; defects: number } | null;
}): PodLight {
  const { booking, bp } = input;
  if (!booking) return 'off';
  if (booking.shift === 'game') return 'pink';
  if (!bp) return 'blue';
  const allSigned = bp.screens.length > 0 && signatureCoverage(bp, input.signedScreens).unsigned === 0;
  if (allSigned && input.audit?.commit === bp.commit && input.audit.defects === 0) return 'green';
  if (input.capturedCommit === bp.commit && !allSigned) return 'amber';
  return 'blue';
}

/**
 * A site is ready for handover when every screen is signed at its current commit, that commit's audit
 * found no defect, and a named person confirmed the structure (which bricks are load-bearing).
 */
export const handoverReady = (input: {
  bp: Blueprint;
  signedScreens: string[];
  audit: { commit: string; defects: number } | null;
  structureConfirmedAt: string | null;
}) => {
  const coverage = signatureCoverage(input.bp, input.signedScreens);
  const reasons: string[] = [];
  if (!input.bp.screens.length) reasons.push('the site has no screen to sign');
  else if (coverage.unsigned) reasons.push(`${coverage.unsigned} of ${coverage.of} screens are not signed at ${input.bp.commit.slice(0, 7)}`);
  if (!input.audit || input.audit.commit !== input.bp.commit) reasons.push(`no audit of ${input.bp.commit.slice(0, 7)}`);
  else if (input.audit.defects) reasons.push(`the audit of ${input.bp.commit.slice(0, 7)} found ${input.audit.defects} defect${input.audit.defects === 1 ? '' : 's'}`);
  if (!input.structureConfirmedAt) reasons.push('nobody has confirmed the structure');
  return { ready: reasons.length === 0, reasons };
};

export interface CampusSite {
  siteId: string;
  owner: string;
  /** Screens not signed at the site's current commit. */
  unsignedScreens: number;
  /** The latest audit is of the current commit and found no defect. */
  auditPassed: boolean;
  /** When the site was handed over, if it was. */
  handedOverAt: string | null;
  /** The owner's check-ins after handover: when, and whether the product was in use. */
  checkins: { at: string; inUse: boolean }[];
}

/**
 * The campus's figures (Stage 6): signatures pending by name (screens unsigned, per owner), audits passed,
 * and products in use at 90 days: of the sites handed over at least 90 days ago, those whose latest
 * check-in made 90 days or more after handover says the product is in use.
 */
export const campusFigures = (sitesOn: CampusSite[], now: Date) => {
  const pending = new Map<string, number>();
  for (const s of sitesOn) if (s.unsignedScreens) pending.set(s.owner, (pending.get(s.owner) ?? 0) + s.unsignedScreens);
  const DAY = 86_400_000;
  const due = sitesOn.filter((s) => s.handedOverAt && now.getTime() - Date.parse(s.handedOverAt) >= 90 * DAY);
  const inUse = due.filter((s) => {
    const late = s.checkins
      .filter((c) => Date.parse(c.at) - Date.parse(s.handedOverAt!) >= 90 * DAY)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    return late?.inUse === true;
  });
  return {
    sites: sitesOn.length,
    signaturesPending: [...pending].map(([person, screens]) => ({ person, screens })).sort((a, b) => b.screens - a.screens || a.person.localeCompare(b.person)),
    auditsPassed: sitesOn.filter((s) => s.auditPassed).length,
    inUseAt90: { inUse: inUse.length, of: due.length },
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
