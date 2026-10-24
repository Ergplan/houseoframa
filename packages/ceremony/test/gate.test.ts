import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Signoff } from '@rama/shared';
import { fixtureRepo, type FixtureRepo } from '../../blueprint/test/fixture-repo.ts';
import { formatGate, runGate } from '../src/gate.ts';
import { line } from '../src/records.ts';

let repo: FixtureRepo;
let base: string;
let change: string;
let tmp: string;

const sign = (over: Partial<Signoff> = {}): Signoff => ({
  id: 's1',
  siteId: 'fixture',
  person: 'Asha Rao',
  target: { kind: 'screen', id: '/bills', commit: change },
  statement: 'Bills shows every bill.',
  at: '2026-10-22T10:00:00Z',
  ...over,
});
const report = (passed: string[], failed: string[] = []) => {
  const file = path.join(tmp, `report-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      testResults: [
        ...passed.map((p) => ({ name: path.join(repo.dir, p), status: 'passed' })),
        ...failed.map((p) => ({ name: path.join(repo.dir, p), status: 'failed' })),
      ],
    }),
  );
  return file;
};
/** Commits a signoffs file on top of the change, gates, then rolls the commit back. */
const withSignoffs = (lines: string[], fn: () => void) => {
  repo.write({ '.rama/signoffs.jsonl': lines.join('\n') + '\n' });
  repo.commit('signatures');
  try {
    fn();
  } finally {
    repo.git('reset', '-q', '--hard', change);
  }
};

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'rama-gate-'));
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/total.ts': 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);\n',
    'lib/bills.ts': 'export const BILLS = [1, 2];\n',
    'lib/total.test.ts': "import { total } from './total';\ntotal([1]);\n",
    'app/page.tsx':
      "import { total } from '../lib/total';\nexport default function Home() { return total([]); }\n",
    'app/bills/page.tsx':
      "import { BILLS } from '../../lib/bills';\nexport default function Bills() { return BILLS.length; }\n",
    'app/help/page.tsx': 'export default function Help() { return null; }\n',
  });
  base = repo.commit('base');
  repo.write({
    'lib/total.ts': 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 1);\n',
    'lib/bills.ts': 'export const BILLS = [1, 2, 3];\n',
  });
  change = repo.commit('change both screens');
});

afterAll(() => {
  repo?.cleanup();
  rmSync(tmp, { recursive: true, force: true });
});

describe('rama gate', () => {
  it('fails every changed screen with no signature and no test report, and names why', () => {
    const r = runGate(repo.dir, base);
    expect(r.ok).toBe(false);
    expect(r.screens.map((s) => [s.route, s.ok, s.changed])).toEqual([
      ['/', false, ['lib/total.ts']],
      ['/bills', false, ['lib/bills.ts']],
    ]);
    expect(r.screens[0]!.reason).toBe('no signature, and no test report was given');
    expect(formatGate(r)).toMatch(/rama gate: FAIL[\s\S]*✗ \/bills: no signature/);
  });

  it('passes a changed screen whose changed code bricks all have a passing test', () => {
    const r = runGate(repo.dir, base, { testReport: report(['lib/total.test.ts']) });
    expect(r.screens.find((s) => s.route === '/')).toMatchObject({
      ok: true,
      tests: ['lib/total.test.ts'],
    });
    expect(r.screens.find((s) => s.route === '/bills')).toMatchObject({
      ok: false,
      reason: 'no signature, and no passing test behind lib/bills.ts',
    });
    expect(r.ok).toBe(false);
    // A failed test does not count.
    expect(
      runGate(repo.dir, base, { testReport: report([], ['lib/total.test.ts']) }).screens[0]!.ok,
    ).toBe(false);
  });

  it('passes a changed screen signed at or after its change; with both, the whole gate passes', () => {
    withSignoffs([line(sign())], () => {
      const r = runGate(repo.dir, base, { testReport: report(['lib/total.test.ts']) });
      expect(r.screens.find((s) => s.route === '/bills')).toMatchObject({
        ok: true,
        reason: `signed by Asha Rao at ${change.slice(0, 7)}`,
      });
      expect(r.ok).toBe(true);
      expect(formatGate(r)).toMatch(/^rama gate: PASS/);
    });
  });

  it('fails a screen signed before its change', () => {
    withSignoffs([line(sign({ target: { kind: 'screen', id: '/bills', commit: base } }))], () => {
      expect(runGate(repo.dir, base).screens.find((s) => s.route === '/bills')!.reason).toBe(
        `signed by Asha Rao at ${base.slice(0, 7)}, before the change at ${change.slice(0, 7)}`,
      );
    });
  });

  it('follows the supersede chain: a replacement signs, a withdrawal unsigns', () => {
    const first = sign({ id: 's1', target: { kind: 'screen', id: '/bills', commit: base } });
    const replaced = sign({ id: 's2', supersedes: 's1', at: '2026-10-22T11:00:00Z' });
    const withdrawn = sign({
      id: 's3',
      supersedes: 's2',
      withdrawn: true,
      statement: 'Withdrawn: the count is wrong.',
      at: '2026-10-22T12:00:00Z',
    });
    withSignoffs([line(first), line(replaced)], () => {
      expect(runGate(repo.dir, base).screens.find((s) => s.route === '/bills')!.ok).toBe(true);
    });
    withSignoffs([line(first), line(replaced), line(withdrawn)], () => {
      expect(runGate(repo.dir, base).screens.find((s) => s.route === '/bills')!.ok).toBe(false);
    });
  });

  it('fails when signatures that were there at the base were rewritten, whatever the screens say', () => {
    const old = sign({ id: 's0', target: { kind: 'screen', id: '/help', commit: base } });
    repo.git('reset', '-q', '--hard', base);
    repo.write({ '.rama/signoffs.jsonl': line(old) + '\n' });
    const signedBase = repo.commit('a signature at the base');
    repo.write({
      'lib/total.ts': 'export const total = () => 0;\n',
      '.rama/signoffs.jsonl': line({ ...old, statement: 'quietly changed' }) + '\n',
    });
    repo.commit('rewrite a signature');
    try {
      const r = runGate(repo.dir, signedBase, { testReport: report(['lib/total.test.ts']) });
      expect(r.problems).toEqual([
        `.rama/signoffs.jsonl was rewritten since ${signedBase.slice(0, 7)}: signatures can only be appended`,
      ]);
      expect(r.ok).toBe(false);
    } finally {
      repo.git('reset', '-q', '--hard', change);
    }
  });

  it('cannot be switched off from inside the target (Invariant 4)', () => {
    repo.write({
      '.rama/gate.json': JSON.stringify({ disabled: true, requireSignatures: false }),
      'rama.config.json': JSON.stringify({ gate: 'off' }),
    });
    repo.commit('try to switch the gate off');
    process.env.RAMA_GATE = 'off';
    try {
      const r = runGate(repo.dir, base);
      expect(r.ok).toBe(false);
      expect(r.screens.filter((s) => !s.ok).map((s) => s.route)).toEqual(['/', '/bills']);
    } finally {
      delete process.env.RAMA_GATE;
      repo.git('reset', '-q', '--hard', change);
    }
  });

  it('sees a removed screen and a deleted brick as changes, which a test cannot cover', () => {
    repo.git('rm', '-q', 'app/help/page.tsx', 'lib/bills.ts');
    repo.write({ 'app/bills/page.tsx': 'export default function Bills() { return 0; }\n' });
    repo.commit('remove help, drop the bills list');
    try {
      const r = runGate(repo.dir, change, { testReport: report(['lib/total.test.ts']) });
      expect(r.screens.map((s) => [s.route, s.removed, s.changed, s.ok])).toEqual([
        ['/bills', false, ['app/bills/page.tsx', 'lib/bills.ts'], false],
        ['/help', true, ['app/help/page.tsx'], false],
      ]);
      expect(formatGate(r)).toContain('✗ /help (removed): no signature');
    } finally {
      repo.git('reset', '-q', '--hard', change);
    }
  });

  it('sees an edit that arrives only through a merge, and judges it at the merge commit', () => {
    const main = repo.git('rev-parse', '--abbrev-ref', 'HEAD').trim();
    repo.git('checkout', '-q', '-b', 'side');
    repo.write({ 'lib/bills.ts': 'export const BILLS = [9];\n' });
    repo.commit('side edit');
    repo.git('checkout', '-q', main);
    repo.git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'merge side',
      'side',
    );
    const merge = repo.git('rev-parse', 'HEAD').trim();
    try {
      const r = runGate(repo.dir, change);
      expect(r.screens.map((s) => [s.route, s.changeCommit])).toEqual([['/bills', merge]]);
      expect(r.ok).toBe(false);
    } finally {
      repo.git('reset', '-q', '--hard', change);
      repo.git('branch', '-q', '-D', 'side');
    }
  });

  it('sees a screen renamed away: the old route is a removed screen that needs its own signature', () => {
    // Same content under a new path: git records a rename (R100).
    repo.write({ 'app/assist/page.tsx': 'export default function Help() { return null; }\n' });
    repo.git('rm', '-q', 'app/help/page.tsx');
    repo.commit('move help to assist');
    const moved = repo.git('rev-parse', 'HEAD').trim();
    try {
      withSignoffs(
        [line(sign({ target: { kind: 'screen', id: '/assist', commit: moved } }))],
        () => {
          const r = runGate(repo.dir, change);
          expect(r.screens.map((s) => [s.route, s.removed, s.ok])).toEqual([
            ['/assist', false, true],
            ['/help', true, false],
          ]);
        },
      );
    } finally {
      repo.git('reset', '-q', '--hard', change);
    }
  });

  it("with House of Rama's public key, counts only sealed signatures: a hand-typed line or a forged withdrawal counts for nothing", async () => {
    const { generateSigningKey, sealerFrom } = await import('../src/seal.ts');
    const key = generateSigningKey();
    const sealer = sealerFrom({ RAMA_SIGNING_KEY: key.privateKey })!;
    const real = sign({ id: 's1' });
    const sealed = { ...real, seal: sealer.seal(real) };
    const typed = sign({ id: 's2', target: { kind: 'screen', id: '/', commit: change } });
    const forgedWithdrawal = sign({
      id: 's3',
      supersedes: 's1',
      withdrawn: true,
      at: '2026-10-22T12:00:00Z',
    });
    withSignoffs([line(sealed), line(typed), line(forgedWithdrawal)], () => {
      const r = runGate(repo.dir, base, { publicKey: key.publicKey });
      expect(r.sealsChecked).toBe(true);
      expect(r.unsealed.map((u) => u.id)).toEqual(['s2', 's3']);
      expect(r.screens.find((s) => s.route === '/bills')).toMatchObject({ ok: true });
      expect(r.screens.find((s) => s.route === '/')).toMatchObject({ ok: false });
      expect(formatGate(r)).toContain(
        '! ignored: the signature s2 by Asha Rao on screen:/ carries no valid seal',
      );
      // Without the key every line counts, and the gate says so.
      const loose = runGate(repo.dir, base);
      expect(loose.screens.find((s) => s.route === '/')).toMatchObject({ ok: true });
      expect(loose.screens.find((s) => s.route === '/bills')).toMatchObject({ ok: false });
      expect(formatGate(loose)).toContain('signatures not checked against House of Rama');
    });
  });

  it('passes when no screen changed, and refuses a base that is not a commit', () => {
    expect(runGate(repo.dir, change)).toMatchObject({ ok: true, screens: [] });
    expect(() => runGate(repo.dir, 'nope')).toThrow(/not a commit/);
  });
});
