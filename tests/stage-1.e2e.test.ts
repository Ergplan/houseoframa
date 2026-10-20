// Stage 1 end to end: the `rama` CLI on a real target repository (Procurement Studio at fac615d):
// extract to a file, diff it against a second extraction, and catch drift with --check.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAMA = path.join(ROOT, 'packages/blueprint/bin/rama.mjs');
const TARGET = path.join(ROOT, 'reference/procurementstudio');
const dir = mkdtempSync(path.join(tmpdir(), 'rama-e2e-'));

const rama = (...args: string[]) => {
  const r = spawnSync('node', [RAMA, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe('stage 1 e2e: rama extract and rama diff on Procurement Studio', () => {
  const a = path.join(dir, 'a.json');
  const b = path.join(dir, 'b.json');

  it('extracts the target to a file and reports the weekend numbers', () => {
    const r = rama('extract', TARGET, '--rev', 'fac615d', '--out', a);
    expect(r.code, r.err).toBe(0);
    const bp = JSON.parse(readFileSync(a, 'utf8'));
    expect(bp.nodes).toHaveLength(34);
    expect(bp.commits).toHaveLength(6);
    expect(r.err).toContain('"importEdges": 50');
  });

  it('a second extraction is identical: rama diff exits 0', () => {
    expect(rama('extract', TARGET, '--rev', 'fac615d', '--out', b).code).toBe(0);
    expect(readFileSync(b, 'utf8')).toBe(readFileSync(a, 'utf8'));
    const d = rama('diff', a, b);
    expect(d).toMatchObject({ code: 0 });
    expect(d.out.trim()).toBe('identical');
  });

  it('an earlier commit differs: rama diff names the change and exits 1', () => {
    const c = path.join(dir, 'c.json');
    expect(rama('extract', TARGET, '--rev', 'fa08284', '--out', c).code).toBe(0);
    const d = rama('diff', c, a);
    expect(d.code).toBe(1);
    expect(d.out).toContain('commits: 5 → 6');
  });

  it('--check passes on a fresh file and fails, with a diff, on a tampered one', () => {
    expect(rama('extract', TARGET, '--rev', 'fac615d', '--check', a).code).toBe(0);
    const bp = JSON.parse(readFileSync(a, 'utf8'));
    bp.nodes = bp.nodes.slice(1);
    writeFileSync(b, JSON.stringify(bp));
    const r = rama('extract', TARGET, '--rev', 'fac615d', '--check', b);
    expect(r.code).toBe(1);
    expect(r.out).toContain('bricks added (1)');
  });
});
