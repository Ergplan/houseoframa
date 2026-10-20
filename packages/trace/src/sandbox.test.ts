import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRepo, type FixtureRepo } from '../../blueprint/test/fixture-repo.ts';
import { runInSandbox } from './sandbox.ts';

let repo: FixtureRepo;
beforeAll(() => {
  repo = fixtureRepo();
  repo.write({
    'lib/math.ts':
      'export const half = (n: number): number => n / 2;\nexport const big = () => 10n;\nexport const TABLE = { a: 1 };\n',
    'lib/env.ts': 'export const secrets = () => Object.keys(process.env).sort();\n',
    'lib/broken.ts': 'export const f = () => { throw new Error("no rate for 2027"); };\n',
    'h.mjs':
      "import { half } from './lib/math.ts';\nconsole.log('noise');\nexport default () => ({ text: String(half(9)) });\n",
  });
});
afterAll(() => repo?.cleanup());

describe('sandbox', () => {
  it("calls the target's own TypeScript function with arguments and returns plain JSON", async () => {
    expect(
      await runInSandbox(repo.dir, { kind: 'call', file: 'lib/math.ts', fn: 'half', args: [9] }),
    ).toEqual({ ok: true, value: 4.5 });
    expect(
      await runInSandbox(repo.dir, { kind: 'call', file: 'lib/math.ts', fn: 'big', args: [] }),
    ).toEqual({ ok: true, value: '10' });
    expect(
      await runInSandbox(repo.dir, { kind: 'export', file: 'lib/math.ts', name: 'TABLE' }),
    ).toEqual({ ok: true, value: { a: 1 } });
  });

  it('runs a harness, ignoring what the target prints', async () => {
    expect(await runInSandbox(repo.dir, { kind: 'harness', file: 'h.mjs' })).toEqual({
      ok: true,
      value: { text: '4.5' },
    });
  });

  it('gives the target no environment beyond PATH, HOME and NODE_ENV: no database URL, no keys', async () => {
    process.env.OPENAI_API_KEY_TEST_LEAK = 'x';
    try {
      const ans = await runInSandbox(repo.dir, {
        kind: 'call',
        file: 'lib/env.ts',
        fn: 'secrets',
        args: [],
      });
      expect(
        ans.ok &&
          (ans.value as string[]).filter(
            (k) => !/^(PATH|HOME|NODE_ENV|PWD|SHLVL|_|OLDPWD)$/.test(k),
          ),
      ).toEqual([]);
    } finally {
      delete process.env.OPENAI_API_KEY_TEST_LEAK;
    }
  });

  it('says why when the code fails, rather than answering', async () => {
    const ans = await runInSandbox(repo.dir, {
      kind: 'call',
      file: 'lib/broken.ts',
      fn: 'f',
      args: [],
    });
    expect(ans.ok).toBe(false);
    expect(!ans.ok && ans.error).toMatch(/no rate for 2027/);
    const missing = await runInSandbox(repo.dir, {
      kind: 'call',
      file: 'lib/math.ts',
      fn: 'nope',
      args: [],
    });
    expect(!missing.ok && missing.error).toMatch(/no exported function nope/);
  });
});
