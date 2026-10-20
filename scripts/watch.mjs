// Continuous checks beside the build (CLAUDE.md §4). On every save it runs, in order: eslint,
// prettier --check, tsc --noEmit per package, vitest for the changed packages then the full suite,
// drizzle-kit check plus a schema-drift probe, the docs/BLUEPRINT.md drift check, and the
// blueprint/self.json drift check. It writes .watch/status.json ({ok, checks:[{name, ok, ms, detail}], at})
// and appends to .watch/log.txt.
//
//   node scripts/watch.mjs          run once, then again on every save
//   node scripts/watch.mjs --once   run once and exit non-zero when any check fails (CI)
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
if (existsSync('.env')) process.loadEnvFile('.env');

const ONCE = process.argv.includes('--once');
const BIN = (name, dir = ROOT) => path.join(dir, 'node_modules/.bin', name);

// Vitest projects (vitest.config.ts) and the directories whose changes select them.
const PROJECTS = [
  { name: '@rama/shared', dirs: ['packages/shared/', 'scripts/gen-blueprint-doc.mjs'] },
  { name: '@rama/db', dirs: ['packages/db/'] },
  { name: '@rama/model', dirs: ['packages/model/', 'prompts/'] },
  { name: '@rama/app', dirs: ['apps/rama/'] },
  { name: 'e2e', dirs: ['tests/'] },
];
const TS_PACKAGES = ['packages/shared', 'packages/db', 'packages/model', 'apps/rama'];
const IGNORED = [
  /(^|\/)node_modules(\/|$)/,
  /^\.git(\/|$)/,
  /(^|\/)\.next(-e2e)?(\/|$)/,
  /^\.watch(\/|$)/,
  /^work(\/|$)/,
  /^reference(\/|$)/,
  /\.tsbuildinfo$/,
  /(^|\/)next-env\.d\.ts$/,
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (err) => resolve({ code: 1, out: String(err) }));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

const tail = (text, n = 25) => text.trim().split('\n').slice(-n).join('\n');

async function check(name, fn) {
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (err) {
    result = { ok: false, detail: String(err?.stack ?? err) };
  }
  return {
    name,
    ok: result.ok,
    ms: Date.now() - started,
    detail: result.detail,
    ...(result.skipped ? { skipped: true } : {}),
  };
}

const command = (cmd, args, opts) => async () => {
  const { code, out } = await run(cmd, args, opts);
  return { ok: code === 0, detail: code === 0 ? tail(out, 3) || 'ok' : tail(out) };
};

/** drizzle-kit check, then regenerate into a copy of the migrations: any new file means the schema drifted. */
async function drizzle() {
  const db = path.join(ROOT, 'packages/db');
  const checked = await run(BIN('drizzle-kit', db), ['check'], { cwd: db });
  if (checked.code !== 0) return { ok: false, detail: tail(checked.out) };
  const tmp = mkdtempSync(path.join(tmpdir(), 'rama-drift-'));
  try {
    cpSync(path.join(db, 'migrations'), tmp, { recursive: true });
    const before = readdirSync(tmp, { recursive: true }).sort().join('\n');
    // drizzle-kit mangles absolute --out paths, so pass it relative to packages/db.
    const gen = await run(
      BIN('drizzle-kit', db),
      [
        'generate',
        '--dialect',
        'postgresql',
        '--schema',
        './src/schema.ts',
        '--out',
        path.relative(db, tmp),
      ],
      { cwd: db },
    );
    if (gen.code !== 0) return { ok: false, detail: tail(gen.out) };
    const after = readdirSync(tmp, { recursive: true }).sort().join('\n');
    const journalSame =
      readFileSync(path.join(tmp, 'meta/_journal.json'), 'utf8') ===
      readFileSync(path.join(db, 'migrations/meta/_journal.json'), 'utf8');
    if (before !== after || !journalSame) {
      return {
        ok: false,
        detail: 'src/schema.ts has changes with no migration: run `pnpm db:generate`',
      };
    }
    return { ok: true, detail: 'migrations consistent; schema matches the latest migration' };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function runChecks(changed) {
  const checks = [];
  checks.push(await check('eslint', command(BIN('eslint'), ['.', '--max-warnings=0'])));
  checks.push(await check('prettier', command(BIN('prettier'), ['--check', '.'])));
  for (const pkg of TS_PACKAGES) {
    checks.push(await check(`tsc ${pkg}`, command(BIN('tsc'), ['--noEmit', '-p', pkg])));
  }

  const projects = changed
    ? PROJECTS.filter((p) => [...changed].some((f) => p.dirs.some((d) => f.startsWith(d)))).map(
        (p) => p.name,
      )
    : [];
  let changedOk = true;
  if (projects.length) {
    const args = ['run', ...projects.flatMap((p) => ['--project', p])];
    const c = await check(`vitest changed (${projects.join(', ')})`, command(BIN('vitest'), args));
    changedOk = c.ok;
    checks.push(c);
  }
  checks.push(
    changedOk
      ? await check('vitest full suite', command(BIN('vitest'), ['run']))
      : {
          name: 'vitest full suite',
          ok: false,
          ms: 0,
          detail: 'not run: the changed-package tests failed',
        },
  );

  checks.push(await check('drizzle', drizzle));
  checks.push(
    await check(
      'blueprint doc drift',
      command('node', ['scripts/gen-blueprint-doc.mjs', '--check']),
    ),
  );
  // Rule 14 starts at Stage 2 and the extractor arrives in Stage 1; until then there is nothing to compare.
  checks.push({
    name: 'blueprint self drift',
    ok: true,
    skipped: true,
    ms: 0,
    detail: 'skipped: packages/blueprint has no extractor until Stage 1 (`rama extract .`)',
  });

  const status = { ok: checks.every((c) => c.ok), checks, at: new Date().toISOString() };
  mkdirSync('.watch', { recursive: true });
  writeFileSync('.watch/status.json', JSON.stringify(status, null, 2) + '\n');
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  const line = `${status.at} ok=${status.ok}${failed.length ? ` failed=[${failed.join('; ')}]` : ''}${
    changed ? ` changed=${[...changed].slice(0, 5).join(',')}` : ''
  }`;
  appendFileSync('.watch/log.txt', line + '\n');
  console.log(`[watch] ${line}`);
  for (const c of checks.filter((c) => !c.ok)) console.log(`[watch] ✗ ${c.name}\n${c.detail}`);
  return status;
}

if (ONCE) {
  const status = await runChecks(null);
  process.exit(status.ok ? 0 : 1);
}

let running = false;
let pending = new Set();
let timer = null;

async function cycle(changed) {
  running = true;
  try {
    await runChecks(changed);
  } finally {
    running = false;
  }
  if (pending.size) schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (running) return;
    const changed = pending;
    pending = new Set();
    void cycle(changed);
  }, 300);
}

watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file) return;
  const rel = file.split(path.sep).join('/');
  if (IGNORED.some((re) => re.test(rel))) return;
  pending.add(rel);
  schedule();
});

console.log('[watch] watching for saves; status in .watch/status.json');
await cycle(null);
