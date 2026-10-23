// What a check says about a brick. The check names are MASTER-PROMPT §7.3. A brick with no finding from
// any check that ran is a pass; a check that did not run is reported as not run, never as a pass.
export const CHECKS = [
  'typecheck',
  'build',
  'test-coverage-per-brick',
  'silenced-lint',
  'swallowed-error',
  'any-type',
  'magic-constant-in-formula',
  'browser-storage-write',
  'env-fallback',
  'long-unauth-route',
  'positional-assumption',
  'unsigned-change',
  'unconfirmed-glossary',
  'open-decision',
] as const;
export type CheckName = (typeof CHECKS)[number];
export type Verdict = 'pass' | 'note' | 'defect';

/** Findings about the site as a whole (a failed build, a check that could not run) sit on this brick. */
export const SITE = '(site)';

export interface CheckFinding {
  brick: string;
  check: CheckName;
  verdict: Exclude<Verdict, 'pass'>;
  text: string;
  file?: string;
  line?: number;
}

export interface CheckRun {
  check: CheckName;
  ran: boolean;
  /** Why it did not run, or what it ran (the command). */
  detail: string;
}

export interface CheckResults {
  commit: string;
  runs: CheckRun[];
  findings: CheckFinding[];
}

const RANK: Record<Verdict, number> = { pass: 0, note: 1, defect: 2 };
export const worse = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);
export const lower = (to: Verdict, than: Verdict) => RANK[to] < RANK[than];

/** The verdict of each brick: the worst of its findings, pass when it has none. */
export function brickVerdicts(
  bricks: string[],
  findings: { brick: string; verdict: Verdict }[],
): Record<string, Verdict> {
  const out: Record<string, Verdict> = Object.fromEntries(
    bricks.map((b) => [b, 'pass' as Verdict]),
  );
  for (const f of findings) out[f.brick] = worse(out[f.brick] ?? 'pass', f.verdict);
  return out;
}

/** A stable order (check, brick, line) so ids and hashes do not depend on how the checks ran. */
export function sortFindings<T extends CheckFinding>(fs: T[]): T[] {
  return [...fs].sort(
    (a, b) =>
      CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check) ||
      a.brick.localeCompare(b.brick) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.text.localeCompare(b.text),
  );
}
