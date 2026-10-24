// Checks that run the target's own scripts (package.json `typecheck`, `build`, `test`) with the package
// manager its lockfile names, in its checkout, with PATH and HOME only: no House of Rama secret reaches
// the target's code. A script that does not exist is a check not run, never a pass.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { isCode } from '@rama/blueprint/metrics';
import { SITE, type CheckFinding, type CheckRun } from '../findings.ts';

export interface Script {
  name: 'typecheck' | 'build' | 'test';
  argv: string[];
}

export function packageManager(repoDir: string): 'pnpm' | 'npm' | 'yarn' {
  if (existsSync(path.join(repoDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(repoDir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** The command for a script, or null when the target has no such script. */
export function scriptCommand(
  repoDir: string,
  name: Script['name'],
  extra: string[] = [],
): string[] | null {
  const pkgFile = path.join(repoDir, 'package.json');
  if (!existsSync(pkgFile)) return null;
  const scripts =
    (JSON.parse(readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }).scripts ??
    {};
  if (!scripts[name]) return null;
  const pm = packageManager(repoDir);
  // npm needs `--` before arguments meant for the script; pnpm and yarn pass them on as they are.
  return [pm, 'run', name, ...(extra.length ? (pm === 'npm' ? ['--', ...extra] : extra) : [])];
}

export function runScript(repoDir: string, argv: string[], timeoutMs: number) {
  const r = spawnSync(argv[0]!, argv.slice(1), {
    cwd: repoDir,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      CI: '1',
    } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    status: r.status,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    timedOut: r.error?.name === 'Error' && r.signal === 'SIGTERM',
  };
}

const tail = (s: string, n = 600) => s.trim().split('\n').slice(-8).join('\n').slice(-n);

/**
 * TypeScript errors in compiler output, `file(line,col): error TSn: message`, with the workspace prefix
 * pnpm adds (`packages/db typecheck: src/x.ts(…)`) or a path relative to a sub-project, mapped to a brick.
 */
export function parseTscErrors(output: string, bricks: Set<string>): CheckFinding[] {
  const out: CheckFinding[] = [];
  for (const raw of output.split('\n')) {
    const m = /^(?:(\S+) \S+: )?(\S+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(raw.trim());
    if (!m) continue;
    const file = m[1] ? path.posix.join(m[1], m[2]!) : m[2]!;
    const brick = bricks.has(file)
      ? file
      : ([...bricks].find((b) => b.endsWith(`/${m[2]}`)) ?? SITE);
    out.push({
      brick,
      check: 'typecheck',
      verdict: 'defect',
      file: brick === SITE ? file : brick,
      line: Number(m[3]),
      text: `Does not compile: ${m[4]} ${m[5]!.slice(0, 200)}`,
    });
  }
  return out;
}

/**
 * Per code brick, from a vitest or jest JSON report and the import graph: a brick a passing test imports
 * passes; one only failing tests import is a defect, and so is each failing test file; one no test
 * imports is a note.
 */
export function testFindings(
  bp: Blueprint,
  report: { testResults?: { name: string; status: string }[] },
  repoDir: string,
): CheckFinding[] {
  const root = path.resolve(repoDir);
  const status = new Map(
    (report.testResults ?? []).map((t) => [
      path.relative(root, path.resolve(root, t.name)).split(path.sep).join('/'),
      t.status,
    ]),
  );
  const out: CheckFinding[] = [];
  for (const [file, s] of status) {
    if (s !== 'passed')
      out.push({
        brick: file,
        check: 'test-coverage-per-brick',
        verdict: 'defect',
        file,
        text: 'This test file fails.',
      });
  }
  const tests = new Map<string, string[]>();
  for (const e of bp.edges) {
    if (bp.nodes.find((n) => n.path === e.from)?.test)
      tests.set(e.to, [...(tests.get(e.to) ?? []), e.from]);
  }
  for (const n of bp.nodes) {
    if (n.test || !isCode(n.path)) continue;
    const behind = tests.get(n.path) ?? [];
    if (!behind.length) {
      out.push({
        brick: n.path,
        check: 'test-coverage-per-brick',
        verdict: 'note',
        file: n.path,
        text: 'No test file reaches this brick, so no test result speaks for it.',
      });
    } else if (!behind.some((t) => status.get(t) === 'passed')) {
      const ran = behind.filter((t) => status.has(t));
      out.push({
        brick: n.path,
        check: 'test-coverage-per-brick',
        verdict: ran.length ? 'defect' : 'note',
        file: n.path,
        text: ran.length
          ? `Every test behind it fails: ${ran.join(', ')}.`
          : `The tests behind it did not run: ${behind.join(', ')}.`,
      });
    }
  }
  return out;
}

export interface RunOptions {
  skip?: ('typecheck' | 'build' | 'test')[];
  timeoutMs?: number;
}

/**
 * Why the checkout cannot stand for the audited code, or null when it can: it must be at the Blueprint's
 * commit, and, unless the Blueprint was read from the working tree, have no change to a tracked file.
 * Scripts run on the checkout as it is, so a mismatch would credit one commit with another's results.
 */
export function checkoutMismatch(repoDir: string, bp: Blueprint): string | null {
  const git = (...args: string[]) =>
    spawnSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
  const head = git('rev-parse', 'HEAD').stdout.trim();
  if (head !== bp.commit)
    return `the checkout is at ${head.slice(0, 7) || 'no commit'}, not the audited ${bp.commit.slice(0, 7)}`;
  if (!bp.worktree && git('status', '--porcelain', '--untracked-files=no').stdout.trim()) {
    return `the checkout has changes to tracked files on top of ${bp.commit.slice(0, 7)}`;
  }
  return null;
}

export function runChecks(
  repoDir: string,
  bp: Blueprint,
  opts: RunOptions = {},
): { runs: CheckRun[]; findings: CheckFinding[] } {
  const runs: CheckRun[] = [];
  const findings: CheckFinding[] = [];
  const bricks = new Set(bp.nodes.map((n) => n.path));
  const timeout = opts.timeoutMs ?? 20 * 60_000;
  const skipped = (name: 'typecheck' | 'build' | 'test') => opts.skip?.includes(name);
  const mismatch = checkoutMismatch(repoDir, bp);
  if (mismatch) {
    for (const check of ['typecheck', 'build', 'test-coverage-per-brick'] as const) {
      runs.push({ check, ran: false, detail: `not run: ${mismatch}` });
    }
    return { runs, findings };
  }

  const tc = scriptCommand(repoDir, 'typecheck');
  if (skipped('typecheck') || !tc)
    runs.push({
      check: 'typecheck',
      ran: false,
      detail: tc ? 'skipped on request' : 'no `typecheck` script',
    });
  else {
    const r = runScript(repoDir, tc, timeout);
    const errs = parseTscErrors(r.output, bricks);
    runs.push({
      check: 'typecheck',
      ran: true,
      detail: tc.join(' '),
      outcome: `exit ${r.status ?? 'none (timed out)'}, ${errs.length} compiler error${errs.length === 1 ? '' : 's'}`,
    });
    findings.push(...errs);
    if (r.status !== 0 && !errs.length) {
      findings.push({
        brick: SITE,
        check: 'typecheck',
        verdict: 'defect',
        text: `\`${tc.join(' ')}\` failed: ${tail(r.output)}`,
      });
    }
  }

  const build = scriptCommand(repoDir, 'build');
  if (skipped('build') || !build)
    runs.push({
      check: 'build',
      ran: false,
      detail: build ? 'skipped on request' : 'no `build` script',
    });
  else {
    const r = runScript(repoDir, build, timeout);
    runs.push({
      check: 'build',
      ran: true,
      detail: build.join(' '),
      outcome: `exit ${r.status ?? 'none (timed out)'}`,
    });
    if (r.status !== 0)
      findings.push({
        brick: SITE,
        check: 'build',
        verdict: 'defect',
        text: `\`${build.join(' ')}\` failed: ${tail(r.output)}`,
      });
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'rama-audit-tests-'));
  try {
    const out = path.join(dir, 'report.json');
    const test = scriptCommand(repoDir, 'test', ['--reporter=json', `--outputFile=${out}`]);
    if (skipped('test') || !test) {
      runs.push({
        check: 'test-coverage-per-brick',
        ran: false,
        detail: test ? 'skipped on request' : 'no `test` script',
      });
    } else {
      const r = runScript(repoDir, test, timeout);
      if (!existsSync(out) && r.status !== 0) {
        // The tests failed before they could report: that is a failed run, whatever the reason.
        runs.push({
          check: 'test-coverage-per-brick',
          ran: true,
          detail: test.join(' '),
          outcome: `exit ${r.status ?? 'none (timed out)'}, no report`,
        });
        findings.push({
          brick: SITE,
          check: 'test-coverage-per-brick',
          verdict: 'defect',
          text: `\`${test.join(' ')}\` failed before writing a report (exit ${r.status ?? 'none'}): ${tail(r.output)}`,
        });
      } else if (!existsSync(out)) {
        runs.push({
          check: 'test-coverage-per-brick',
          ran: false,
          detail: `\`${test.join(' ')}\` exited 0 but wrote no JSON report, so no test can be credited: ${tail(r.output, 300)}`,
        });
      } else {
        const report = JSON.parse(readFileSync(out, 'utf8')) as {
          testResults?: { name: string; status: string }[];
        };
        const files = report.testResults ?? [];
        const passed = files.filter((t) => t.status === 'passed').length;
        runs.push({
          check: 'test-coverage-per-brick',
          ran: true,
          detail: test.join(' '),
          outcome: `exit ${r.status}, ${passed} test file${passed === 1 ? '' : 's'} passed, ${files.length - passed} failed`,
        });
        findings.push(...testFindings(bp, report, repoDir));
        // A runner that fails outside any test file (a setup error, a crash after the report) still fails.
        if (r.status !== 0 && files.every((t) => t.status === 'passed')) {
          findings.push({
            brick: SITE,
            check: 'test-coverage-per-brick',
            verdict: 'defect',
            text: `\`${test.join(' ')}\` exited ${r.status} though no test file failed: ${tail(r.output)}`,
          });
        }
        if (!files.length) {
          findings.push({
            brick: SITE,
            check: 'test-coverage-per-brick',
            verdict: 'note',
            text: 'The test run reported no test file.',
          });
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { runs, findings };
}
