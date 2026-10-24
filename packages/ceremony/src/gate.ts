// The merge gate (Invariant 4): `rama gate <repoPath> --base <commit>`. Plain code, no model call.
// Every screen whose bricks changed since the base needs either a signature in force, made at or after
// the screen's last change, or a passing test behind every changed code brick it renders. The gate reads
// the target's code, history and `.rama/signoffs.jsonl` and nothing else: no configuration file and no
// environment variable inside the target can switch it off or change its rule.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint, Signoff } from '@rama/shared';
import { extract } from '@rama/blueprint';
import { isCode } from '@rama/blueprint/metrics';
import { parseLines, SIGNOFFS_FILE, SignoffRecord, signaturesInForce } from './records.ts';
import { verifySeal } from './seal.ts';

export interface GateScreen {
  id: string;
  route: string;
  /** True when the screen was at the base and is gone at HEAD: removing a screen is a change too. */
  removed: boolean;
  /** Its bricks that changed since the base. */
  changed: string[];
  /** The last commit since the base that touched one of its bricks. */
  changeCommit: string;
  /** The signature that lets it through, when one does. */
  signature: Signoff | null;
  /** The passing tests behind its changed code bricks, when they cover every one. */
  tests: string[];
  ok: boolean;
  reason: string;
}

export interface GateResult {
  ok: boolean;
  base: string;
  head: string;
  screens: GateScreen[];
  /** Problems that fail the gate whatever the screens say (a rewritten signature file, a bad base). */
  problems: string[];
  /** Signature lines that counted for nothing: their seal did not verify, or no public key was given. */
  unsealed: { id: string; person: string; target: string }[];
  /** True when signatures were checked against House of Rama's public key. */
  sealsChecked: boolean;
}

export interface GateInput {
  bp: Blueprint;
  /** The Blueprint at the base: its screens and their bricks count too, so a deletion is a change. */
  baseBp?: Blueprint | null;
  base: string;
  /** Commits after the base, oldest first, with the paths each touched. */
  changes: { sha: string; paths: string[] }[];
  signoffs: Signoff[];
  /** Test files (repository paths) that passed; null when no test report was given. */
  passingTests: Set<string> | null;
  problems?: string[];
  /**
   * House of Rama's public key (base64 SPKI DER), given by the workflow on the base branch, never read from
   * the target. A signature counts only when its seal verifies against it; without it no signature
   * counts, and only passing tests let a changed screen through.
   */
  publicKey?: string | null;
}

/** The gate's rule over its inputs: deterministic and free of I/O, so it is tested on crafted fixtures. */
export function evaluateGate(input: GateInput): GateResult {
  const { bp } = input;
  const order = new Map(bp.commits.map((c, i) => [c.sha, i]));
  const unsealed = input.publicKey
    ? input.signoffs.filter((s) => !verifySeal(s, input.publicKey!))
    : input.signoffs;
  const counted = input.signoffs.filter((s) => !unsealed.includes(s));
  const inForce = signaturesInForce(counted);
  const testsOf = new Map<string, string[]>();
  for (const e of bp.edges) {
    const from = bp.nodes.find((n) => n.path === e.from);
    if (!from?.test) continue;
    testsOf.set(e.to, [...(testsOf.get(e.to) ?? []), e.from]);
  }

  // Every screen at HEAD or at the base, with the bricks it had at either: a screen that was removed, or a
  // brick deleted from a screen, is still seen as changed.
  const all = new Map<string, { id: string; route: string; bricks: string[]; removed: boolean }>();
  for (const s of input.baseBp?.screens ?? [])
    all.set(s.id, { id: s.id, route: s.route, bricks: [...s.bricks], removed: true });
  for (const s of bp.screens) {
    const before = all.get(s.id);
    all.set(s.id, {
      id: s.id,
      route: s.route,
      bricks: [...new Set([...(before?.bricks ?? []), ...s.bricks])],
      removed: false,
    });
  }
  const screens: GateScreen[] = [];
  for (const screen of [...all.values()].sort((a, b) => a.route.localeCompare(b.route))) {
    const touching = input.changes.filter((c) => c.paths.some((p) => screen.bricks.includes(p)));
    if (!touching.length) continue;
    const changed = [
      ...new Set(touching.flatMap((c) => c.paths.filter((p) => screen.bricks.includes(p)))),
    ].sort();
    const changeCommit = touching.at(-1)!.sha;
    const sig = inForce.get(`screen:${screen.id}`) ?? null;
    const signedAfter =
      sig &&
      order.has(sig.target.commit) &&
      order.get(sig.target.commit)! >= order.get(changeCommit)!;

    const code = changed.filter((p) => isCode(p));
    const covering = code.map((p) =>
      (testsOf.get(p) ?? []).filter((t) => input.passingTests?.has(t)),
    );
    const tested =
      input.passingTests !== null && code.length > 0 && covering.every((t) => t.length > 0);

    let reason: string;
    if (signedAfter) reason = `signed by ${sig!.person} at ${sig!.target.commit.slice(0, 7)}`;
    else if (tested) reason = 'every changed code brick has a passing test';
    else if (sig && !signedAfter) {
      reason = order.has(sig.target.commit)
        ? `signed by ${sig.person} at ${sig.target.commit.slice(0, 7)}, before the change at ${changeCommit.slice(0, 7)}`
        : `signed by ${sig.person} at ${sig.target.commit.slice(0, 7)}, which is not in this history`;
    } else if (input.passingTests === null) reason = 'no signature, and no test report was given';
    else if (!code.length)
      reason = 'no signature, and the changed bricks are not code a test can cover';
    else {
      const bare = code.filter((_, i) => covering[i]!.length === 0);
      reason = `no signature, and no passing test behind ${bare.join(', ')}`;
    }
    screens.push({
      id: screen.id,
      route: screen.route,
      removed: screen.removed,
      changed,
      changeCommit,
      signature: signedAfter ? sig : null,
      tests: tested ? [...new Set(covering.flat())].sort() : [],
      ok: Boolean(signedAfter) || tested,
      reason,
    });
  }
  const problems = input.problems ?? [];
  return {
    ok: problems.length === 0 && screens.every((s) => s.ok),
    base: input.base,
    head: bp.commit,
    screens,
    problems,
    unsealed: unsealed.map((s) => ({
      id: s.id,
      person: s.person,
      target: `${s.target.kind}:${s.target.id}`,
    })),
    sealsChecked: Boolean(input.publicKey),
  };
}

const git = (repo: string, args: string[]) =>
  spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Test files that passed, from a vitest or jest JSON report: `testResults[].name` and `.status`. */
export function passingFromReport(reportFile: string, repoDir: string): Set<string> {
  const report = JSON.parse(readFileSync(reportFile, 'utf8')) as {
    testResults?: { name: string; status: string }[];
  };
  const root = path.resolve(repoDir);
  return new Set(
    (report.testResults ?? [])
      .filter((t) => t.status === 'passed')
      .map((t) => path.relative(root, path.resolve(root, t.name)).split(path.sep).join('/')),
  );
}

/**
 * The commits from `base` to HEAD along the first-parent chain, oldest first, with every path each one
 * changed: a merge commit carries everything it brought in (diffed against its first parent), and a rename
 * or copy names both its old and its new path, so a screen merged in or renamed away is still seen.
 */
export function changesSince(repoDir: string, base: string): { sha: string; paths: string[] }[] {
  const log = git(repoDir, [
    'log',
    '--reverse',
    '--first-parent',
    '-m',
    '--format=%x1e%H',
    '--name-status',
    '-M',
    '-z',
    `${base}..HEAD`,
  ]).stdout;
  return log
    .split('\x1e')
    .filter(Boolean)
    .map((rec) => {
      // `<sha>\0\n<status>\0<path>\0…`; a rename or copy (R100, C75) carries its old and new path.
      const [head = '', ...fields] = rec.split('\0').map((f) => f.replace(/^\n+/, ''));
      const paths: string[] = [];
      for (let i = 0; i < fields.length; i++) {
        const status = fields[i]!;
        if (!status) continue;
        if (/^[RC]\d*$/.test(status)) {
          paths.push(fields[i + 1] ?? '', fields[i + 2] ?? '');
          i += 2;
        } else {
          paths.push(fields[i + 1] ?? '');
          i += 1;
        }
      }
      return { sha: head.trim(), paths: [...new Set(paths.filter(Boolean))] };
    });
}

/** Runs the gate on a checkout: HEAD against `base`. */
export function runGate(
  repoDir: string,
  base: string,
  opts: { testReport?: string; publicKey?: string } = {},
): GateResult {
  const problems: string[] = [];
  const baseSha = git(repoDir, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${base}^{commit}`,
  ]).stdout.trim();
  if (!baseSha) throw new Error(`${base} is not a commit in ${repoDir}`);
  if (git(repoDir, ['merge-base', '--is-ancestor', baseSha, 'HEAD']).status !== 0) {
    problems.push(`${base} is not an ancestor of HEAD`);
  }
  const bp = extract(repoDir);
  let baseBp: Blueprint | null = null;
  try {
    baseBp = extract(repoDir, { rev: baseSha });
  } catch (err) {
    problems.push(`the base ${baseSha.slice(0, 7)} could not be read: ${(err as Error).message}`);
  }
  const changes = changesSince(repoDir, baseSha);

  // The signature file travels with the code. It must only ever grow: lines already at the base stay.
  const at = (rev: string) => {
    const r = git(repoDir, ['show', `${rev}:${SIGNOFFS_FILE}`]);
    return r.status === 0 ? r.stdout : '';
  };
  const headText = at('HEAD');
  const baseLines = at(baseSha)
    .split('\n')
    .filter((l) => l.trim());
  const headLines = headText.split('\n').filter((l) => l.trim());
  if (baseLines.some((l, i) => headLines[i] !== l)) {
    problems.push(
      `${SIGNOFFS_FILE} was rewritten since ${baseSha.slice(0, 7)}: signatures can only be appended`,
    );
  }
  let signoffs: Signoff[] = [];
  try {
    signoffs = parseLines(headText, SignoffRecord, SIGNOFFS_FILE);
  } catch (err) {
    problems.push((err as Error).message);
  }

  let passing: Set<string> | null = null;
  if (opts.testReport) {
    if (!existsSync(opts.testReport))
      problems.push(`the test report ${opts.testReport} does not exist`);
    else passing = passingFromReport(opts.testReport, repoDir);
  }
  return evaluateGate({
    bp,
    baseBp,
    base: baseSha,
    changes,
    signoffs,
    passingTests: passing,
    problems,
    publicKey: opts.publicKey ?? null,
  });
}

/** The gate's verdict as a person reads it in a CI log. */
export function formatGate(r: GateResult): string {
  const lines = [
    `rama gate: ${r.ok ? 'PASS' : 'FAIL'} (${r.base.slice(0, 7)}..${r.head.slice(0, 7)})`,
  ];
  for (const p of r.problems) lines.push(`  ✗ ${p}`);
  if (!r.sealsChecked) {
    lines.push(
      '  ! no --public-key: no signature can be checked, so none counts; only passing tests let a screen through',
    );
  } else {
    for (const u of r.unsealed)
      lines.push(
        `  ! ignored: the signature ${u.id.slice(0, 8)} by ${u.person} on ${u.target} carries no valid seal`,
      );
  }
  if (!r.screens.length) lines.push('  no screen changed since the base');
  for (const s of r.screens) {
    lines.push(`  ${s.ok ? '✓' : '✗'} ${s.route}${s.removed ? ' (removed)' : ''}: ${s.reason}`);
    lines.push(`      changed: ${s.changed.join(', ')} (last at ${s.changeCommit.slice(0, 7)})`);
  }
  if (!r.ok) {
    lines.push(
      '',
      'Sign the screens marked ✗ in House of Rama (walkthrough), or put a passing test behind their changed bricks.',
    );
  }
  return lines.join('\n');
}
