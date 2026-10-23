// Stage 4, CI-safe: the `rama gate` command a target's CI runs, on a crafted repository. It exits 1 with
// a readable list while a changed screen is unsigned, and 0 once a signature at the change is committed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixtureRepo, type FixtureRepo } from '../packages/blueprint/test/fixture-repo.ts';
import { line } from '../packages/ceremony/src/records.ts';

let repo: FixtureRepo;
let base: string;
let change: string;
// The `rama` executable itself, so its exit codes are seen as CI sees them (pnpm reports any failure as 1).
const RAMA = fileURLToPath(new URL('../packages/blueprint/bin/rama.mjs', import.meta.url));
const gate = (...args: string[]) =>
  spawnSync(process.execPath, [RAMA, 'gate', repo.dir, ...args], { encoding: 'utf8' });

beforeAll(() => {
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/total.ts': 'export const total = 1;\n',
    'app/page.tsx':
      "import { total } from '../lib/total';\nexport default function Home() { return total; }\n",
  });
  base = repo.commit('base');
  repo.write({ 'lib/total.ts': 'export const total = 2;\n' });
  change = repo.commit('change the total');
});

afterAll(() => repo?.cleanup());

describe('rama gate (the command)', () => {
  it('exits 1 and names the unsigned changed screen', () => {
    const r = gate('--base', base);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toContain('rama gate: FAIL');
    expect(r.stdout).toContain('✗ /: no signature, and no test report was given');
    expect(r.stdout).toContain('changed: lib/total.ts');
  });

  it('exits 0 once a named signature at the change is committed with the code', () => {
    repo.write({
      '.rama/signoffs.jsonl':
        line({
          id: 's1',
          siteId: 'fixture',
          person: 'Asha Rao',
          target: { kind: 'screen', id: '/', commit: change },
          statement: 'Home shows the total.',
          at: '2026-10-23T09:00:00Z',
        }) + '\n',
    });
    repo.commit('sign home');
    const r = gate('--base', base);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('✓ /: signed by Asha Rao');
  });

  it('exits 2 with the usage for a bad call', () => {
    const r = gate();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
  });
});
