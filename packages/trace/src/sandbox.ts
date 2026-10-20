// Re-executes a target's own code in a separate Node process: cwd is the target's checkout, the
// environment holds only PATH and HOME (no database URL, no vendor keys), TypeScript is loaded with
// tsx, and the `react-server` condition is set so Next.js server modules (`server-only`) load as they
// do in the target's own scripts. The answer is plain JSON. Nothing is ever retyped: when the code
// cannot run, the answer says so.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARK = '@@RAMA-SANDBOX@@';
const RUNNER = fileURLToPath(new URL('./sandbox-runner.mjs', import.meta.url));
// tsx's full loader (what `node --import tsx` loads): it hooks both ES modules and CommonJS, which a
// target's own packages may be compiled to.
const TSX = pathToFileURL(
  path.join(
    path.dirname(createRequire(import.meta.url).resolve('tsx/package.json')),
    'dist/loader.mjs',
  ),
).href;

export type SandboxRequest =
  | { kind: 'export'; file: string; name: string }
  | { kind: 'call'; file: string; fn: string; args: unknown[] }
  | { kind: 'harness'; file: string };

export type SandboxAnswer = { ok: true; value: unknown } | { ok: false; error: string };

export function runInSandbox(
  repoDir: string,
  req: SandboxRequest,
  timeoutMs = 60_000,
): Promise<SandboxAnswer> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--conditions=react-server', '--import', TSX, RUNNER, JSON.stringify(req)],
      {
        cwd: repoDir,
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const at = out.lastIndexOf(MARK);
      if (at === -1) {
        resolve({
          ok: false,
          error: `the sandbox gave no answer (exit ${code}): ${err.trim().split('\n').slice(-3).join(' ')}`,
        });
        return;
      }
      try {
        resolve(JSON.parse(out.slice(at + MARK.length).split('\n')[0]!) as SandboxAnswer);
      } catch {
        resolve({ ok: false, error: 'the sandbox answer was not JSON' });
      }
    });
  });
}
