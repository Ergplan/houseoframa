// `pnpm dev`: starts Postgres (docker compose), applies migrations and the seed, then runs the
// Next.js app and the watcher side by side. Ctrl-C stops both; Postgres keeps running.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
if (existsSync('.env')) process.loadEnvFile('.env');

if (!process.env.GIT_SHA) {
  try {
    process.env.GIT_SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // leave unset: the page then shows "commit unknown"
  }
}

const step = (msg) => console.log(`[dev] ${msg}`);

function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, host);
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline)
          reject(new Error(`${host}:${port} did not open within ${timeoutMs}ms`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

async function waitForDb() {
  for (let i = 0; i < 60; i++) {
    try {
      execFileSync('docker', ['compose', 'exec', '-T', 'db', 'pg_isready', '-U', 'rama'], {
        stdio: 'ignore',
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Postgres did not become ready in 30s');
}

step('starting Postgres (docker compose up -d db)');
execFileSync('docker', ['compose', 'up', '-d', 'db'], { stdio: 'inherit' });
await waitForDb();
const dbUrl = new URL(process.env.DATABASE_URL ?? 'postgres://rama:rama@localhost:5432/rama');
await waitForPort(dbUrl.hostname, Number(dbUrl.port || 5432), 30_000);

step('applying migrations and seed');
execFileSync('pnpm', ['--filter', '@rama/db', 'migrate'], { stdio: 'inherit' });
execFileSync('pnpm', ['--filter', '@rama/db', 'seed'], { stdio: 'inherit' });

const children = [];
function start(name, cmd, args) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const prefix = (d) =>
    d
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((l) => `[${name}] ${l}`)
      .join('\n') + '\n';
  child.stdout.on('data', (d) => process.stdout.write(prefix(d)));
  child.stderr.on('data', (d) => process.stderr.write(prefix(d)));
  child.on('exit', (code) => {
    step(`${name} exited (${code})`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

step(`starting the app (GIT_SHA=${process.env.GIT_SHA ?? 'unknown'}) and the watcher`);
start('app', 'pnpm', ['--filter', '@rama/app', 'dev']);
start('watch', 'node', ['scripts/watch.mjs']);
