// The product's own tests, run from a button (Stage 7): its `test` script with a JSON report, PATH and
// HOME only, recorded as the last run in work/<site>/tests.json. "Verified" (Invariant 11) reads it.
// The run also records, per test file, which of the product's functions actually ran: Node writes V8
// coverage for each worker (NODE_V8_COVERAGE), and with Vitest's thread pool each test file runs in a
// worker of its own, so what ran can be told test file by test file.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passingFromReport } from '@rama/ceremony';
import { scriptCommand } from '@rama/audit';
import type { TestRun } from '@rama/blueprint/metrics';
import { workDir, type SiteLocation } from '@rama/blueprint/site';
import { run as spawnRun } from './spawn.ts';

export const testRunFile = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId, 'tests.json');

export function readTestRun(siteId: string, env: NodeJS.ProcessEnv = process.env): TestRun | null {
  const f = testRunFile(siteId, env);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as TestRun) : null;
}

interface V8Coverage {
  result: { url: string; functions: { functionName: string; ranges: { count: number }[] }[] }[];
}

/**
 * Per test file, the product functions (`<file>#<name>`) that ran in its worker. A worker that ran more
 * than one test file, or none, tells nothing about any one of them and is left out.
 */
export function executedByTest(
  coverageDir: string,
  repoDir: string,
  testFiles: Set<string>,
): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  if (!existsSync(coverageDir)) return {};
  const root = path.resolve(repoDir);
  for (const f of readdirSync(coverageDir).filter((x) => x.endsWith('.json'))) {
    const cov = JSON.parse(readFileSync(path.join(coverageDir, f), 'utf8')) as V8Coverage;
    const scripts = cov.result
      .map((s) => {
        const url = s.url.split('?')[0]!;
        const abs = url.startsWith('file://') ? fileURLToPath(url) : url;
        const rel = path.relative(root, abs).split(path.sep).join('/');
        return { rel, functions: s.functions };
      })
      .filter(
        (s) =>
          s.rel &&
          !s.rel.startsWith('..') &&
          !path.isAbsolute(s.rel) &&
          !s.rel.includes('node_modules/'),
      );
    const tests = [...new Set(scripts.map((s) => s.rel).filter((r) => testFiles.has(r)))];
    if (tests.length !== 1) continue;
    const ran = (out[tests[0]!] ??= new Set());
    for (const s of scripts.filter((x) => !testFiles.has(x.rel)))
      for (const fn of s.functions)
        if (fn.functionName && (fn.ranges[0]?.count ?? 0) > 0)
          ran.add(`${s.rel}#${fn.functionName}`);
  }
  return Object.fromEntries(Object.entries(out).map(([t, set]) => [t, [...set].sort()]));
}

/** Runs the site's tests and records the run; throws a plain sentence when they cannot be run. */
export async function runSiteTests(
  site: SiteLocation,
  env: NodeJS.ProcessEnv = process.env,
  now = () => new Date(),
): Promise<TestRun> {
  const dir = mkdtempSync(path.join(tmpdir(), 'rama-tests-'));
  const out = path.join(dir, 'report.json');
  const coverage = path.join(dir, 'coverage');
  try {
    const argv = scriptCommand(site.repoDir, 'test', [
      '--reporter=json',
      `--outputFile=${out}`,
      '--pool=threads',
    ]);
    if (!argv) throw new Error('This product has no tests to run yet.');
    await spawnRun(argv[0]!, argv.slice(1), {
      cwd: site.repoDir,
      // PATH and HOME only: no House of Rama secret reaches the product's code.
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        CI: '1',
        NODE_V8_COVERAGE: coverage,
      } as unknown as NodeJS.ProcessEnv,
      timeout: 10 * 60_000,
    });
    if (!existsSync(out))
      throw new Error('The tests ran but wrote no report, so none can be credited.');
    const report = JSON.parse(readFileSync(out, 'utf8')) as {
      testResults?: { name: string; status: string }[];
    };
    const passing = [...passingFromReport(out, site.repoDir)].sort();
    const all = (report.testResults ?? []).map((t) =>
      path.relative(site.repoDir, path.resolve(site.repoDir, t.name)).split(path.sep).join('/'),
    );
    const head = spawnSync('git', ['-C', site.repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const run: TestRun = {
      commit: head.stdout.trim(),
      at: now().toISOString(),
      passing,
      failing: all.filter((t) => !passing.includes(t)).sort(),
      executed: executedByTest(coverage, site.repoDir, new Set(all)),
    };
    writeFileSync(testRunFile(site.id, env), JSON.stringify(run, null, 2) + '\n');
    return run;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
