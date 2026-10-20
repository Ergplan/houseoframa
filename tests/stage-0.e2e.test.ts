// Stage 0 end to end: the real Next.js dev server serves / with the product line and the short SHA.
// Runs beside `pnpm dev` on its own port and distDir. Stage 0 has no target repository yet; from Stage 1
// each stage's e2e runs on a real target.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../apps/rama', import.meta.url));
const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
let server: ChildProcess;
let port = 0;
let output = '';

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
    env: { ...process.env, GIT_SHA: SHA, NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' },
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

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
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
