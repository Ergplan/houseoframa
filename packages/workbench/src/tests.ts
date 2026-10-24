// The product's own tests, run from a button (Stage 7): its `test` script with a JSON report, PATH and
// HOME only, recorded as the last run in work/<site>/tests.json. "Verified" (Invariant 11) reads it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { passingFromReport } from '@rama/ceremony';
import { scriptCommand } from '@rama/audit';
import type { TestRun } from '@rama/blueprint/metrics';
import { workDir, type SiteLocation } from '@rama/blueprint/site';

export const testRunFile = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId, 'tests.json');

export function readTestRun(siteId: string, env: NodeJS.ProcessEnv = process.env): TestRun | null {
  const f = testRunFile(siteId, env);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as TestRun) : null;
}

/** Runs the site's tests and records the run; throws a plain sentence when they cannot be run. */
export function runSiteTests(
  site: SiteLocation,
  env: NodeJS.ProcessEnv = process.env,
  now = () => new Date(),
): TestRun {
  const dir = mkdtempSync(path.join(tmpdir(), 'rama-tests-'));
  const out = path.join(dir, 'report.json');
  try {
    const argv = scriptCommand(site.repoDir, 'test', ['--reporter=json', `--outputFile=${out}`]);
    if (!argv) throw new Error('This product has no tests to run yet.');
    spawnSync(argv[0]!, argv.slice(1), {
      cwd: site.repoDir,
      // PATH and HOME only: no House of Rama secret reaches the product's code.
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        CI: '1',
      } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
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
    };
    writeFileSync(testRunFile(site.id, env), JSON.stringify(run, null, 2) + '\n');
    return run;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
