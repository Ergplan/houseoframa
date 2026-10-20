// Stage 0 end to end: the real Next.js dev server serves / with the product line and the short SHA.
// Runs beside `pnpm dev`, and beside other runs of itself (the watcher's), on its own port and distDir. Stage 0 has no target repository yet; from Stage 1
// each stage's e2e runs on a real target.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../apps/rama', import.meta.url));
const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
let server: ChildProcess;
let port = 0;
let output = '';
// Next refuses a second dev server on one distDir, so every run gets its own.
const distDir = `.next-e2e/run-${process.pid}-${Date.now()}`;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      const addr = s.address();
      s.close(() =>
        typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port')),
      );
    });
  });
}

beforeAll(async () => {
  port = await freePort();
  server = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(port)], {
    cwd: appDir,
    env: { ...process.env, GIT_SHA: SHA, NEXT_DIST_DIR: distDir, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout?.on('data', (d) => (output += d));
  server.stderr?.on('data', (d) => (output += d));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited:\n${output}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`next dev did not start within 90s:\n${output}`);
}, 100_000);

afterAll(async () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  rmSync(path.join(appDir, distDir), { recursive: true, force: true });
});

describe('stage 0 e2e', () => {
  it('serves / with "House of Rama · Built on trust" and the short SHA', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('House of Rama · Built on trust');
    expect(html).toContain('commit abcdef0');
  });
});

describe('stage 1 e2e: the health route on the real dev server', () => {
  it('serves GET /api/health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: 'abcdef0' });
  });
});
