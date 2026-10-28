// Re-executes a target's own code in a separate Node process: cwd is the target's checkout, the
// environment holds only PATH and HOME (no database URL, no vendor keys), TypeScript is loaded with
// tsx, and the `react-server` condition is set so Next.js server modules (`server-only`) load as they
// do in the target's own scripts. The answer is plain JSON. Nothing is ever retyped: when the code
// cannot run, the answer says so.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { traceSrcDir } from './here.ts';

const MARK = '@@RAMA-SANDBOX@@';
// Found through traceSrcDir, not `new URL('./sandbox-runner.mjs', import.meta.url)`: the app's bundler
// takes the latter for a static asset, and the app runs captures since Stage 7.
const RUNNER = path.join(traceSrcDir(), 'sandbox-runner.mjs');
// tsx's full loader (what `node --import tsx` loads): it hooks both ES modules and CommonJS, which a
// target's own packages may be compiled to.
const TSX = pathToFileURL(
  path.join(
    path.dirname(createRequire(path.join(traceSrcDir(), 'sandbox.ts')).resolve('tsx/package.json')),
    'dist/loader.mjs',
  ),
).href;

export type SandboxRequest =
  | { kind: 'export'; file: string; name: string }
  | { kind: 'call'; file: string; fn: string; args: unknown[] }
  | { kind: 'harness'; file: string }
  /** A value written the way the product writes it on a screen: `SHOW[show](value)` of rama/define.ts. */
  | { kind: 'show'; file: string; show: string; value: unknown }
  /** The tables a schema file exports, as the product's own Drizzle describes them (Stage 11). */
  | { kind: 'tables'; file: string };

/** A table as the product's own Drizzle describes it: what the build loop's sandbox database is made from. */
export interface SandboxTable {
  name: string;
  columns: {
    name: string;
    /** The SQL type Drizzle writes for it (`serial`, `timestamp with time zone`). */
    type: string;
    primary: boolean;
    notNull: boolean;
    unique: boolean;
    /** The default as SQL, when the column has one Postgres applies. */
    default: string | null;
  }[];
  /** A primary key over several columns, when the table declares one. */
  primaryKey: string[];
}

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
