// Starts the real Next.js dev server for an end-to-end test, beside `pnpm dev` and beside other runs
// of itself (the watcher's): its own free port and its own distDir, removed afterwards.
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../apps/rama', import.meta.url));

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

export interface DevServer {
  url: string;
  /** For a browser: Next's dev server serves its scripts only to its own origin, localhost. */
  browserUrl: string;
  /** Everything the server printed, for a failing test's message. */
  output: () => string;
  stop: () => Promise<void>;
}

export async function startDevServer(
  env: NodeJS.ProcessEnv,
  warm: string[] = ['/'],
): Promise<DevServer> {
  const port = await freePort();
  // Next refuses a second dev server on one distDir, so every run gets its own.
  const distDir = `.next-e2e/run-${process.pid}-${Date.now()}-${port}`;
  let output = '';
  const server: ChildProcess = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(port)], {
    cwd: appDir,
    env: { ...process.env, ...env, NEXT_DIST_DIR: distDir, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout?.on('data', (d) => (output += d));
  server.stderr?.on('data', (d) => (output += d));
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (server.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // already gone
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    rmSync(path.join(appDir, distDir), { recursive: true, force: true });
  };
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited:\n${output}`);
    try {
      const res = await fetch(`${url}${warm[0]}`);
      if (res.status < 500) {
        // Compile the other routes now, so the tests do not wait on first compilation.
        for (const w of warm.slice(1)) await fetch(`${url}${w}`);
        return { url, browserUrl: `http://localhost:${port}`, output: () => output, stop };
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await stop();
  throw new Error(`next dev did not start within 90s:\n${output}`);
}
