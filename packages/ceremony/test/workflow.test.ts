// The gate's CI workflow, as a target includes it: what keeps it from being switched off from inside.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../ci/rama-gate.yml', import.meta.url), 'utf8');

const job = (name: string) =>
  yml.split(/^ {2}(?=\w[\w-]*:$)/m).find((j) => j.startsWith(`${name}:`))!;

describe('ci/rama-gate.yml', () => {
  it('runs from the base branch, so a pull request cannot edit the gate that judges it', () => {
    expect(yml).toMatch(/^on:\n {2}pull_request_target:/m);
    expect(yml).not.toMatch(/^ {2}pull_request:/m);
  });

  it('holds a read-only token, keeps no credentials and passes no secret to the code it runs', () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(yml.match(/persist-credentials: false/g)).toHaveLength(3);
    expect(yml).not.toContain('secrets.');
  });

  it("runs the target's code only in the tests job, which has no House of Rama checkout", () => {
    const tests = job('tests');
    expect(tests).toContain('npm ci');
    expect(tests).not.toContain('Ergplan/houseoframa');
    const gate = job('gate');
    expect(gate).not.toMatch(/\bnpm\b|\bnpx\b/);
    expect(gate).toContain('repository: Ergplan/houseoframa');
  });

  it("gates whatever the tests job did, with House of Rama's gate at a pinned ref against the pull request's base", () => {
    expect(job('tests')).toContain('continue-on-error: true');
    expect(job('gate')).toMatch(/needs: tests\n\s+if: \$\{\{ !cancelled\(\) \}\}/);
    expect(job('gate')).toMatch(
      /pnpm --dir rama rama gate "\$GITHUB_WORKSPACE\/target" --base "\$BASE" "\$@"/,
    );
    expect(job('gate').split('- name: Gate')[1]).not.toContain('|| true');
  });
});

describe('installGate', () => {
  it('writes the workflow into the checkout pinned to the given ref, and refuses a ref that is not one', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { gateWorkflow, installGate } = await import('../src/install.ts');
    const dir = mkdtempSync(path.join(tmpdir(), 'rama-install-'));
    try {
      const file = installGate(dir, 'stage-4-start');
      expect(file).toBe(path.join(dir, '.github/workflows/rama-gate.yml'));
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('ref: stage-4-start');
      expect(text).not.toContain('RAMA_REF');
      expect(() => gateWorkflow('main; rm -rf /')).toThrow(/not a git ref/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
