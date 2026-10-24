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

  it('names test files by repository path before handing the report over, as passingFromReport reads them', async () => {
    const step = job('tests').split('- name: Name each test file')[1]!.split('- uses:')[0]!;
    const script = /node -e '([\s\S]*?)'\n/.exec(step)![1]!.replace(/\n\s+/g, ' ');
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { passingFromReport } = await import('../src/gate.ts');
    const tests = mkdtempSync(path.join(tmpdir(), 'rama-tests-job-'));
    const gate = mkdtempSync(path.join(tmpdir(), 'rama-gate-job-'));
    try {
      const report = path.join(tests, 'rama-tests.json');
      writeFileSync(
        report,
        JSON.stringify({
          testResults: [{ name: path.join(tests, 'lib/x.test.ts'), status: 'passed' }],
        }),
      );
      execFileSync(process.execPath, ['-e', script], { cwd: tests });
      // Read on another runner, against another checkout's root.
      expect([...passingFromReport(report, path.join(gate, 'target'))]).toEqual(['lib/x.test.ts']);
    } finally {
      rmSync(tests, { recursive: true, force: true });
      rmSync(gate, { recursive: true, force: true });
    }
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
      expect(text).toContain("PUBLIC_KEY: ''");
      const keyed = readFileSync(
        installGate(dir, 'stage-4-start', 'MCowBQYDK2VwAyEAabc+/='),
        'utf8',
      );
      expect(keyed).toContain("PUBLIC_KEY: 'MCowBQYDK2VwAyEAabc+/='");
      expect(keyed).toContain(
        'if [ -n "$PUBLIC_KEY" ]; then set -- "$@" --public-key "$PUBLIC_KEY"; fi',
      );
      expect(() => gateWorkflow('main', "x'; curl evil")).toThrow(/not a base64 public key/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
