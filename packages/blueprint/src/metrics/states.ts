// Three states and one counting rule (Invariant 11). A screen is Verified (a test exercised it, as the
// run's own record of what executed shows, and passed in the last run), Confirmed (a named person's sealed signature at or after its last change) or
// Unverified; there is no fourth state, and "a test imports this file" is not one. Every count of
// screens names its audience: "N of M customer screens signed". Plain functions of their inputs, so the
// site, the inspector, the trainer console and the audit all show the same words (Invariant 7).
import type { Blueprint, Screen, Signoff } from '@rama/shared';

export type ScreenState = 'Verified' | 'Confirmed' | 'Unverified';
export type Audience = 'customer' | 'staff' | 'admin';
export const STATES: readonly ScreenState[] = ['Verified', 'Confirmed', 'Unverified'];

/** One run of the product's tests: the test files that passed and failed, at a commit. */
export interface TestRun {
  commit: string;
  at: string;
  passing: string[];
  failing: string[];
  /**
   * Per test file, the product's functions that actually ran while it ran (`<file>#<function>`), from the
   * run's V8 coverage. Absent when the run did not record it: then nothing it did counts as evidence.
   */
  executed?: Record<string, string[]>;
}

/** What each test file claims to exercise, read from its code: functions it calls, pages it renders. */
export interface TestReach {
  /** `<file>#<function>` for each imported function the test calls. */
  calls: string[];
  /**
   * `<page file>#<component>` for each page whose default export the test imports and uses (renders).
   * A page whose component has no name it can be recognised by in the run's record is left out.
   */
  renders: string[];
}

/** A figure on a screen, by the function that computes it. */
export interface FigureFn {
  fn: string;
  file: string;
}

/**
 * A source as code only: comments dropped, and every string or template literal replaced by a marker
 * `\uE000<n>\uE000` whose text is kept aside. What a test says in a comment or a string is not what it
 * does. (A regular-expression literal holding a quote can throw this off; tests seldom have one.)
 */
export function codeOf(src: string): { code: string; strings: string[] } {
  const strings: string[] = [];
  let code = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < src.length) {
        const d = src[j]!;
        if (d === '\\') j += 2;
        else if (c === '`' && d === '$' && src[j + 1] === '{') {
          depth++;
          j += 2;
        } else if (c === '`' && d === '}' && depth > 0) {
          depth--;
          j++;
        } else if (d === c && depth === 0) break;
        else j++;
      }
      strings.push(src.slice(i + 1, j));
      code += `\uE000${strings.length - 1}\uE000`;
      i = j + 1;
    } else {
      code += c;
      i++;
    }
  }
  return { code, strings };
}

/** The name of a page's default export (`export default function Total`), as the run's record names it. */
function pageComponent(src: string): string | null {
  const { code } = codeOf(src);
  return (
    /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(code)?.[1] ??
    /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(code)?.[1] ??
    null
  );
}

/** The local names a source gives its default imports, with the module each comes from. */
function defaultImports(code: string, strings: string[]): { name: string; spec: string }[] {
  return [...code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*\uE000(\d+)\uE000/g)].map(
    (m) => ({ name: m[1]!, spec: strings[Number(m[2])]! }),
  );
}

/** Whether an import specifier, from a test file, names a given file (relative specifiers only). */
function specNames(testFile: string, spec: string, file: string): boolean {
  if (!spec.startsWith('.')) return false;
  const parts = testFile.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const target = parts.join('/');
  const bare = file.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  return target === file || target === bare || `${target}/index` === bare;
}

/**
 * What each test brick claims to exercise. `read` gives a brick's source, read as code only. A call is an
 * imported name followed by `(`. A render is a page's default export, imported and then used: as a JSX
 * element or called. Importing a file is not enough (Invariant 11). A claim counts only when the run's
 * record shows the code ran (stateOf). A path handed to a browser is not counted: the run cannot show
 * that the visit happened.
 */
export function testReach(bp: Blueprint, read: (path: string) => string | null): Record<string, TestReach> {
  const out: Record<string, TestReach> = {};
  const pages = new Set(bp.screens.map((s) => s.file));
  for (const t of bp.nodes.filter((n) => n.test)) {
    const { code, strings } = codeOf(read(t.path) ?? '');
    const reach: TestReach = { calls: [], renders: [] };
    const defaults = defaultImports(code, strings);
    for (const e of bp.edges.filter((x) => x.from === t.path && !x.typeOnly)) {
      for (const sym of e.symbols) {
        if (sym === 'default' && pages.has(e.to)) {
          const used = defaults
            .filter((d) => specNames(t.path, d.spec, e.to))
            .some((d) => new RegExp(`<${d.name}[\\s/>]|\\b${d.name}\\s*\\(`).test(code));
          const component = pageComponent(read(e.to) ?? '');
          if (used && component) reach.renders.push(`${e.to}#${component}`);
        } else if (sym !== '*' && sym !== 'default' && new RegExp(`\\b${sym}\\s*\\(`).test(code))
          reach.calls.push(`${e.to}#${sym}`);
      }
    }
    reach.calls = [...new Set(reach.calls)].sort();
    reach.renders = [...new Set(reach.renders)].sort();
    out[t.path] = reach;
  }
  return out;
}

/** The last commit (in history order) that touched one of the screen's bricks; empty when none did. */
export function lastChangeOf(bp: Blueprint, screen: Pick<Screen, 'bricks'>): string {
  const bricks = new Set(screen.bricks);
  let last = '';
  for (const c of bp.commits) if (c.changes.some((x) => bricks.has(x.path) || (x.from && bricks.has(x.from)))) last = c.sha;
  return last;
}

export interface StateInput {
  bp: Blueprint;
  /** The last test run; null when the tests were never run. */
  run: TestRun | null;
  reach: Record<string, TestReach>;
  /** The screen's figures, by the function behind each. */
  figures: Record<string, FigureFn[]>;
  /**
   * False when the figures are not known at the Blueprint's commit (the screens were photographed before
   * the last change): then no figure-function evidence counts, since a new figure would go unchecked.
   */
  figuresKnown?: boolean;
  /** Signatures in force by `screen:<id>`. */
  signatures: Map<string, Signoff>;
  /** Whether a signature carries House of Rama's seal (verifySeal against the app's public key). */
  sealed: (s: Signoff) => boolean;
}

export interface StateOf {
  state: ScreenState;
  /** Both facts, whichever word is shown: a signed screen may be tested too. */
  verified: boolean;
  confirmed: boolean;
  /** The passing tests that exercise the screen. */
  tests: string[];
  signature: Signoff | null;
  /** Why, in plain words, one sentence per fact. */
  why: string[];
}

/**
 * The screen's state. Confirmed when a named person signed it (sealed) at or after its last change;
 * else Verified when, in the last run (at or after its last change), a passing test rendered it or
 * called every one of its figure functions: the test's code says so and the run's record shows that
 * code ran; else Unverified.
 */
export function stateOf(screen: Screen, input: StateInput): StateOf {
  const { bp, run } = input;
  const order = new Map(bp.commits.map((c, i) => [c.sha, i]));
  const changed = lastChangeOf(bp, screen);
  const atOrAfter = (sha: string) => order.has(sha) && (order.get(sha)! >= (order.get(changed) ?? -1));
  const why: string[] = [];

  const known = input.figuresKnown !== false;
  const fns = known ? (input.figures[screen.id] ?? []) : [];
  const passing = new Set(run?.passing ?? []);
  const ran = (t: string) => new Set(run?.executed?.[t] ?? []);
  const exercising = Object.entries(input.reach)
    .filter(([t]) => passing.has(t))
    // The page's own component ran in this test's worker: not just any function of its module.
    .filter(([t, r]) => r.renders.some((k) => k.startsWith(`${screen.file}#`) && ran(t).has(k)))
    .map(([t]) => t);
  const callers = (f: FigureFn) =>
    Object.entries(input.reach)
      .filter(([t, r]) => passing.has(t) && r.calls.includes(`${f.file}#${f.fn}`) && ran(t).has(`${f.file}#${f.fn}`))
      .map(([t]) => t);
  const allCalled = fns.length > 0 && fns.every((f) => callers(f).length > 0);
  const tests = [...new Set([...exercising, ...(allCalled ? fns.flatMap(callers) : [])])].sort();
  const fresh = run !== null && atOrAfter(run.commit);
  const verified = tests.length > 0 && fresh;
  if (verified) why.push(`Verified: ${tests.length === 1 ? 'a test checks it and passes' : `${tests.length} tests check it and pass`}.`);
  else if (!known)
    why.push('Its figures are not known at this commit: photograph the screens again, then run the tests.');
  else if (!run) why.push('No test run is on record.');
  else if (!run.executed) why.push('The last test run did not record what ran, so no test counts.');
  else if (tests.length && !fresh) why.push('Its tests passed before its last change; they have not run since.');
  else if (fns.length && !allCalled)
    why.push(
      `No passing test checks ${fns
        .filter((f) => callers(f).length === 0)
        .map((f) => f.fn)
        .join(', ')}.`,
    );
  else why.push('No passing test checks this screen.');

  const sig = input.signatures.get(`screen:${screen.id}`) ?? null;
  const confirmed = Boolean(sig && !sig.withdrawn && input.sealed(sig) && atOrAfter(sig.target.commit));
  if (confirmed) why.push(`Confirmed: ${sig!.person} signed it.`);
  else if (sig && !input.sealed(sig)) why.push(`The signature by ${sig.person} carries no valid seal.`);
  else if (sig && !sig.withdrawn) why.push(`${sig.person} signed it before its last change.`);

  return {
    state: confirmed ? 'Confirmed' : verified ? 'Verified' : 'Unverified',
    verified,
    confirmed,
    tests,
    signature: confirmed ? sig : null,
    why,
  };
}

/** The counting rule: every number says what it counts and for whom. */
export interface Counts {
  audience: Audience;
  /** Screens for this audience. */
  of: number;
  signed: number;
  verified: number;
  unverified: number;
  /** "2 of 3 customer screens signed". */
  sentence: string;
}

export function counts(screens: { audience: Audience; state: StateOf }[], audience: Audience): Counts {
  const mine = screens.filter((s) => s.audience === audience);
  const signed = mine.filter((s) => s.state.confirmed).length;
  return {
    audience,
    of: mine.length,
    signed,
    verified: mine.filter((s) => s.state.verified).length,
    unverified: mine.filter((s) => s.state.state === 'Unverified').length,
    sentence: `${signed} of ${mine.length} ${audience} screen${mine.length === 1 ? '' : 's'} signed`,
  };
}

/** The site in the three words: how many screens are in each state. */
export function stateTally(states: StateOf[]): Record<ScreenState, number> {
  const t: Record<ScreenState, number> = { Verified: 0, Confirmed: 0, Unverified: 0 };
  for (const s of states) t[s.state]++;
  return t;
}

export interface BuildingState {
  state: ScreenState;
  /** Who signed, when the building is Confirmed: every person who signed one of its screens. */
  by: string[];
  /** Its screens in the three words. */
  tally: Record<ScreenState, number>;
  /** Why, in one plain sentence that says what it counts. */
  why: string;
}

/**
 * A building's flag, from its screens' states. The word must hold of the whole building: Confirmed when a
 * named person signed every one of its screens; Verified when a passing test exercises every one of them
 * (a signed screen counts only if it is tested too); otherwise Unverified, saying how many are checked
 * and how. A building with no screen of its own (the work its screens share, or the work behind them)
 * is Unverified: the three states are earned by screens.
 */
export function buildingState(screens: StateOf[]): BuildingState {
  const tally = stateTally(screens);
  const n = screens.length;
  const of = `${n} screen${n === 1 ? '' : 's'}`;
  const by = [...new Set(screens.flatMap((s) => (s.confirmed && s.signature ? [s.signature.person] : [])))].sort();
  if (n === 0) return { state: 'Unverified', by: [], tally, why: 'It has no screen of its own, so nobody can sign it or check it on a screen.' };
  if (screens.every((s) => s.confirmed)) return { state: 'Confirmed', by, tally, why: `All ${of} signed by name.` };
  if (screens.every((s) => s.verified)) return { state: 'Verified', by: [], tally, why: `All ${of} checked by a passing test.` };
  const tested = screens.filter((s) => s.verified).length;
  const signed = screens.filter((s) => s.confirmed).length;
  const parts = [tested ? `${tested} checked by a passing test` : null, signed ? `${signed} signed by name` : null].filter(Boolean);
  return {
    state: 'Unverified',
    by: [],
    tally,
    why: parts.length
      ? `Of ${of}, ${parts.join(' and ')}: not one check for all of them yet.`
      : `None of its ${of} checked yet.`,
  };
}
