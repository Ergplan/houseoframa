// The house stack (templates/house-stack): laid down in an empty product as its first lift, and the
// figures lint, run from House of Rama's own copy so the product's copy cannot change what is checked.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { installGate } from '@rama/ceremony';
import { homeDir } from '@rama/db';

export const SCAFFOLD_DIR = 'templates/house-stack';
export const LINT_FILE = 'rama/lint.ts';
const SKIP = new Set(['node_modules', '.next']);

export const scaffoldDir = (env: NodeJS.ProcessEnv = process.env) =>
  path.join(homeDir(env), SCAFFOLD_DIR);

/** Whether the checkout already stands on the house stack. */
export const onHouseStack = (repoDir: string) =>
  existsSync(path.join(repoDir, 'rama/figures.ts')) && existsSync(path.join(repoDir, LINT_FILE));

/** The text put in for {{name}}, {{idea}} and {{id}}, escaped for the kind of file it lands in. */
function fill(text: string, file: string, product: { id: string; name: string; idea: string }) {
  const esc = (s: string) =>
    file.endsWith('.json')
      ? JSON.stringify(s).slice(1, -1)
      : /\.(tsx?|mjs)$/.test(file)
        ? s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')
        : s;
  return text
    .replaceAll('{{name}}', esc(product.name))
    .replaceAll('{{idea}}', esc(product.idea))
    .replaceAll('{{id}}', esc(product.id));
}

function files(dir: string, base = ''): string[] {
  return readdirSync(path.join(dir, base)).flatMap((f) => {
    if (SKIP.has(f)) return [];
    const rel = base ? `${base}/${f}` : f;
    return statSync(path.join(dir, rel)).isDirectory() ? files(dir, rel) : [rel];
  });
}

/**
 * Lays the house stack into the product's checkout: every file of the scaffold with the product's name
 * and idea put in, and the merge gate's workflow pinned to `ref` with House of Rama's public key. Files
 * the product already has (its README, .gitignore) are replaced by the scaffold's.
 */
export function layDownScaffold(
  repoDir: string,
  product: { id: string; name: string; idea: string },
  gate: { ref: string; publicKey: string },
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const from = scaffoldDir(env);
  const laid = files(from);
  for (const f of laid) {
    const to = path.join(repoDir, f);
    cpSync(path.join(from, f), to);
    const text = readFileSync(to, 'utf8');
    if (text.includes('{{')) writeFileSync(to, fill(text, f, product));
  }
  installGate(repoDir, gate.ref, gate.publicKey);
  return laid;
}

export interface LintFinding {
  file: string;
  line: number;
  sentence: string;
}

/** Runs House of Rama's copy of the figures lint on the checkout, in a process of its own. */
export function lintProduct(
  repoDir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LintFinding[]> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(scaffoldDir(env), LINT_FILE), repoDir, '--json'],
      {
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
        } as unknown as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), 5 * 60_000);
    const done = (why: string | null) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out) as LintFinding[]);
      } catch {
        resolve([
          {
            file: LINT_FILE,
            line: 1,
            sentence: `The figures lint could not read the product: ${(err || why || 'no answer').split('\n')[0]!.slice(0, 300)}`,
          },
        ]);
      }
    };
    child.on('error', (e) => done(e.message));
    child.on('close', () => done(null));
  });
}
