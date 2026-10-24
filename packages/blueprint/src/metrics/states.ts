// Three states and one counting rule (Invariant 11). A screen is Verified (a test exercises it and passed
// in the last run), Confirmed (a named person's sealed signature at or after its last change) or
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
}

/** What each test file exercises, read from its source: functions it calls, pages it renders, routes it visits. */
export interface TestReach {
  /** `<file>#<function>` for each imported function the test calls. */
  calls: string[];
  /** Page files whose default export the test imports (renders). */
  renders: string[];
  /** Path literals in the test, such as '/total' handed to a browser or a fetch. */
  routes: string[];
}

/** A figure on a screen, by the function that computes it. */
export interface FigureFn {
  fn: string;
  file: string;
}

/**
 * A source as code only: comments dropped, and every string or template literal replaced by a marker
 * `\u0000<n>\u0000` whose text is kept aside. What a test says in a comment or a string is not what it
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
      code += `\u0000${strings.length - 1}\u0000`;
      i = j + 1;
    } else {
      code += c;
      i++;
    }
  }
  return { code, strings };
}

/** The local names a source gives its default imports, with the module each comes from. */
function defaultImports(code: string, strings: string[]): { name: string; spec: string }[] {
  return [...code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*\u0000(\d+)\u0000/g)].map(
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
 * What each test brick exercises. `read` gives a brick's source. A call is an imported name followed by
 * `(`. A render is a page's default export, imported and then used: as a JSX element or called. A route
 * is a path handed to a visiting call (goto, fetch, visit, request, get, post), as a literal or after a
 * base address in a template. Importing a file, or naming a path, is not enough (Invariant 11).
 */
export function testReach(bp: Blueprint, read: (path: string) => string | null): Record<string, TestReach> {
  const out: Record<string, TestReach> = {};
  const pages = new Set(bp.screens.map((s) => s.file));
  for (const t of bp.nodes.filter((n) => n.test)) {
    const { code, strings } = codeOf(read(t.path) ?? '');
    const reach: TestReach = { calls: [], renders: [], routes: [] };
    const defaults = defaultImports(code, strings);
    for (const e of bp.edges.filter((x) => x.from === t.path && !x.typeOnly)) {
      for (const sym of e.symbols) {
        if (sym === 'default' && pages.has(e.to)) {
          const used = defaults
            .filter((d) => specNames(t.path, d.spec, e.to))
            .some((d) => new RegExp(`<${d.name}[\\s/>]|\\b${d.name}\\s*\\(`).test(code));
          if (used) reach.renders.push(e.to);
        } else if (sym !== '*' && sym !== 'default' && new RegExp(`\\b${sym}\\s*\\(`).test(code))
          reach.calls.push(`${e.to}#${sym}`);
      }
    }
    // The first argument of a visiting call, when it is a literal: a path, or a base address then a path.
    for (const m of code.matchAll(/\b(?:goto|fetch|visit|request|get|post)\s*\(\s*\u0000(\d+)\u0000/g)) {
      const path = /^(?:\$\{[^}]*\})?(\/[A-Za-z0-9_\-/.[\]?=&]*)$/.exec(strings[Number(m[1])]!);
      if (path) reach.routes.push(path[1]!);
    }
    reach.calls = [...new Set(reach.calls)].sort();
    reach.renders = [...new Set(reach.renders)].sort();
    reach.routes = [...new Set(reach.routes)].sort();
    out[t.path] = reach;
  }
  return out;
}

/** Whether a concrete path (`/bills/7`) is an instance of a route pattern (`/bills/[id]`). */
function routeMatches(pattern: string, path: string): boolean {
  const re = pattern
    .split('/')
    .map((seg) =>
      /^\[\[?\.\.\./.test(seg) ? '.*' : /^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${re}/?$`).test(path);
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
 * else Verified when a test that renders it, visits its route, or calls every one of its figure
 * functions passed in the last run, and that run is at or after its last change; else Unverified.
 */
export function stateOf(screen: Screen, input: StateInput): StateOf {
  const { bp, run } = input;
  const order = new Map(bp.commits.map((c, i) => [c.sha, i]));
  const changed = lastChangeOf(bp, screen);
  const atOrAfter = (sha: string) => order.has(sha) && (order.get(sha)! >= (order.get(changed) ?? -1));
  const why: string[] = [];

  const fns = input.figures[screen.id] ?? [];
  const passing = new Set(run?.passing ?? []);
  const exercising = Object.entries(input.reach)
    .filter(([t]) => passing.has(t))
    .filter(
      ([, r]) =>
        r.renders.includes(screen.file) ||
        r.routes.some((p) => routeMatches(screen.route, p.split('?')[0]!)) ,
    )
    .map(([t]) => t);
  const callers = (f: FigureFn) =>
    Object.entries(input.reach)
      .filter(([t, r]) => passing.has(t) && r.calls.includes(`${f.file}#${f.fn}`))
      .map(([t]) => t);
  const allCalled = fns.length > 0 && fns.every((f) => callers(f).length > 0);
  const tests = [...new Set([...exercising, ...(allCalled ? fns.flatMap(callers) : [])])].sort();
  const fresh = run !== null && atOrAfter(run.commit);
  const verified = tests.length > 0 && fresh;
  if (verified) why.push(`Verified: ${tests.length === 1 ? 'a test checks it and passes' : `${tests.length} tests check it and pass`}.`);
  else if (!run) why.push('No test run is on record.');
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
