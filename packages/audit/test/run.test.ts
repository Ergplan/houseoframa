// The checks that run the target's scripts, on a fixture repository whose scripts print what a real
// toolchain prints; and the parsers on their own.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRepo, type FixtureRepo } from '../../blueprint/test/fixture-repo.ts';
import { extract } from '@rama/blueprint';
import { parseTscErrors, runChecks, scriptCommand, testFindings } from '../src/checks/run.ts';
import { SITE } from '../src/findings.ts';

describe('parseTscErrors', () => {
  const bricks = new Set(['lib/a.ts', 'packages/db/src/x.ts']);
  it('maps errors to bricks, with a pnpm workspace prefix or a sub-project path', () => {
    const out = [
      'lib/a.ts(3,5): error TS2322: Type string is not assignable to type number.',
      'packages/db typecheck: src/x.ts(10,1): error TS2304: Cannot find name y.',
      'elsewhere/z.ts(1,1): error TS1005: ; expected.',
      'Found 3 errors.',
    ].join('\n');
    expect(parseTscErrors(out, bricks).map((f) => [f.brick, f.line, f.verdict])).toEqual([
      ['lib/a.ts', 3, 'defect'],
      ['packages/db/src/x.ts', 10, 'defect'],
      [SITE, 1, 'defect'],
    ]);
  });
  it('finds nothing in clean output', () => {
    expect(parseTscErrors('Done in 2.1s\n', bricks)).toEqual([]);
  });
});

let repo: FixtureRepo;
const pkg = (scripts: Record<string, string>) => ({
  'package.json': JSON.stringify({ name: 'shop', scripts }),
  'package-lock.json': '{}',
});

beforeAll(() => {
  repo = fixtureRepo();
  repo.write({
    'lib/a.ts': 'export const a = 1;\n',
    'lib/b.ts': 'export const b = 2;\n',
    'lib/c.ts': 'export const c = 3;\n',
    'lib/a.test.ts': "import { a } from './a';\na;\n",
    'lib/b.test.ts': "import { b } from './b';\nb;\n",
    ...pkg({}),
  });
  repo.commit('code');
});
afterAll(() => repo?.cleanup());

describe('testFindings', () => {
  it('passes a brick a passing test imports; a failing test is a defect, and so is a brick only it covers; no test is a note', () => {
    const bp = extract(repo.dir);
    const f = testFindings(
      bp,
      {
        testResults: [
          { name: `${repo.dir}/lib/a.test.ts`, status: 'passed' },
          { name: 'lib/b.test.ts', status: 'failed' },
        ],
      },
      repo.dir,
    );
    expect(f.map((x) => [x.brick, x.verdict, x.text])).toEqual([
      ['lib/b.test.ts', 'defect', 'This test file fails.'],
      ['lib/b.ts', 'defect', 'Every test behind it fails: lib/b.test.ts.'],
      ['lib/c.ts', 'note', 'No test imports this brick.'],
    ]);
  });
});

describe('runChecks (the target own scripts, PATH and HOME only)', () => {
  it('reports a check whose script does not exist as not run, never as a pass', () => {
    const r = runChecks(repo.dir, extract(repo.dir));
    expect(r.runs).toEqual([
      { check: 'typecheck', ran: false, detail: 'no `typecheck` script' },
      { check: 'build', ran: false, detail: 'no `build` script' },
      { check: 'test-coverage-per-brick', ran: false, detail: 'no `test` script' },
    ]);
    expect(r.findings).toEqual([]);
  });

  it('turns compiler errors, a failed build and a failing test into defects; clean runs into nothing', () => {
    // A stand-in for vitest: writes the JSON report where --outputFile says, as vitest does.
    const runner = (status: string) =>
      `const o = process.argv.find((a) => a.startsWith('--outputFile=')).slice(13);\nrequire('fs').writeFileSync(o, JSON.stringify({ testResults: [{ name: 'lib/a.test.ts', status: '${status}' }, { name: 'lib/b.test.ts', status: 'passed' }] }));\n`;
    repo.write({ 'tools/fake-vitest.cjs': runner('failed') });
    repo.write(
      pkg({
        typecheck: `node -e "console.log('lib/c.ts(1,14): error TS2322: no.'); process.exit(2)"`,
        build: `node -e "console.error('Module not found'); process.exit(1)"`,
        test: 'node tools/fake-vitest.cjs',
      }),
    );
    repo.commit('broken scripts');
    let r = runChecks(repo.dir, extract(repo.dir));
    expect(r.runs.every((x) => x.ran)).toBe(true);
    expect(r.runs[0]!.detail).toBe('npm run typecheck');
    expect(r.runs.map((x) => x.outcome)).toEqual([
      'exit 2, 1 compiler error',
      'exit 1',
      'exit 0, 1 test file passed, 1 failed',
    ]);
    expect(r.findings.map((f) => [f.check, f.brick, f.verdict])).toEqual([
      ['typecheck', 'lib/c.ts', 'defect'],
      ['build', SITE, 'defect'],
      ['test-coverage-per-brick', 'lib/a.test.ts', 'defect'],
      ['test-coverage-per-brick', 'lib/a.ts', 'defect'],
      ['test-coverage-per-brick', 'lib/c.ts', 'note'],
      ['test-coverage-per-brick', 'tools/fake-vitest.cjs', 'note'],
    ]);
    expect(r.findings[1]!.text).toContain('Module not found');

    repo.write({
      ...pkg({ typecheck: 'node -e ""', build: 'node -e ""', test: 'node tools/fake-vitest.cjs' }),
      'tools/fake-vitest.cjs': runner('passed'),
    });
    repo.commit('clean scripts');
    r = runChecks(repo.dir, extract(repo.dir));
    expect(r.findings.map((f) => [f.check, f.brick])).toEqual([
      ['test-coverage-per-brick', 'lib/c.ts'],
      ['test-coverage-per-brick', 'tools/fake-vitest.cjs'],
    ]);
  });

  it('fails a test run that exits non-zero though every listed file passed, and notes an empty run', () => {
    const exits = (code: number, files: string) =>
      `const o = process.argv.find((a) => a.startsWith('--outputFile=')).slice(13);\nrequire('fs').writeFileSync(o, JSON.stringify({ testResults: ${files} }));\nprocess.exit(${code});\n`;
    repo.write({
      ...pkg({ test: 'node tools/fake-vitest.cjs' }),
      'tools/fake-vitest.cjs': exits(1, "[{ name: 'lib/a.test.ts', status: 'passed' }]"),
    });
    repo.commit('a runner that crashes after its report');
    let r = runChecks(repo.dir, extract(repo.dir), { skip: ['typecheck', 'build'] });
    expect(r.findings.filter((f) => f.brick === SITE).map((f) => f.verdict)).toEqual(['defect']);
    expect(r.findings.find((f) => f.brick === SITE)!.text).toContain(
      'exited 1 though no test file failed',
    );
    repo.write({ 'tools/fake-vitest.cjs': exits(0, '[]') });
    repo.commit('a runner that finds nothing');
    r = runChecks(repo.dir, extract(repo.dir), { skip: ['typecheck', 'build'] });
    expect(r.findings.filter((f) => f.brick === SITE).map((f) => [f.verdict, f.text])).toEqual([
      ['note', 'The test run reported no test file.'],
    ]);
  });

  it('does not run the scripts on a checkout that is not the audited code', () => {
    const bp = extract(repo.dir);
    repo.write({ 'lib/a.ts': 'export const a = 42;\n' });
    try {
      const r = runChecks(repo.dir, bp);
      expect(r.runs.map((x) => [x.ran, x.detail])).toEqual(
        Array(3).fill([
          false,
          `not run: the checkout has changes to tracked files on top of ${bp.commit.slice(0, 7)}`,
        ]),
      );
      repo.commit('moved on');
      expect(runChecks(repo.dir, bp).runs[0]!.detail).toMatch(
        /^not run: the checkout is at [0-9a-f]{7}, not the audited/,
      );
    } finally {
      repo.git('reset', '-q', '--hard', bp.commit);
    }
  });

  it('gives the target no House of Rama secret', () => {
    process.env.RAMA_AUDIT_SECRET = 'do-not-leak';
    try {
      repo.write(
        pkg({
          typecheck: `node -e "if (process.env.RAMA_AUDIT_SECRET || process.env.DATABASE_URL) { console.log('x.ts(1,1): error TS1: leaked'); process.exit(1) }"`,
        }),
      );
      repo.commit('a leak probe');
      const r = runChecks(repo.dir, extract(repo.dir), { skip: ['build', 'test'] });
      expect(r.findings).toEqual([]);
    } finally {
      delete process.env.RAMA_AUDIT_SECRET;
    }
  });

  it('builds the command with the package manager the lockfile names', () => {
    repo.write(pkg({ test: 'vitest run' }));
    repo.commit('a test script');
    expect(scriptCommand(repo.dir, 'test', ['--reporter=json'])).toEqual([
      'npm',
      'run',
      'test',
      '--',
      '--reporter=json',
    ]);
    expect(scriptCommand(repo.dir, 'build')).toBeNull();
  });
});
