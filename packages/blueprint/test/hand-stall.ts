// A hand-written chai stall with a fixed history of seven commits, for the counting rules' tests
// (metrics/states.test.ts): one screen whose figure no test calls, two that are called. It is the sample
// product as it was written by hand before Stage 9 rebuilt the sample from the house stack; it is test
// data only, and nothing shows it to a person.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./fixtures/hand-stall', import.meta.url));

/** The history, oldest first: each commit adds these files from the fixture. */
const HISTORY = [
  {
    subject: 'Start the chai stall: a Next.js app on the house stack',
    files: ['package.json', 'next.config.mjs', 'tsconfig.json', '.gitignore', 'README.md'],
  },
  {
    subject: 'The orders table, and the sample day the stall reads until a database is connected',
    files: ['db/schema.ts', 'db/orders.ts', 'data/orders.json'],
  },
  {
    subject: "Money: an order's amount, the day's takings and the GST on them",
    files: ['lib/money.ts', 'lib/preview.ts'],
  },
  {
    subject: "Three screens: today's orders, a new order, today's total",
    files: [
      'components/Figure.tsx',
      'app/layout.tsx',
      'app/page.tsx',
      'app/new/page.tsx',
      'app/total/page.tsx',
    ],
  },
  {
    subject: 'Tests for the money and for counting the orders',
    files: ['lib/money.test.ts', 'lib/orders.test.ts'],
  },
  {
    subject: 'Trace every figure to its function, and say how to photograph the screens',
    files: ['rama/figures.ts', '.rama/screens.json'],
  },
  {
    subject: 'Name the three things the stall does, in the owner’s words',
    files: ['.rama/features.json'],
  },
];

const AUTHOR = { name: 'Rama Builder', email: 'builder@houseoframa.local' };

export function makeHandStall(target: string) {
  if (existsSync(target)) throw new Error(`${target} already exists`);
  mkdirSync(target, { recursive: true });
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: AUTHOR.name,
    GIT_AUTHOR_EMAIL: AUTHOR.email,
    GIT_COMMITTER_NAME: AUTHOR.name,
    GIT_COMMITTER_EMAIL: AUTHOR.email,
  };
  const git = (...args: string[]) => execFileSync('git', ['-C', target, ...args], { env, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  HISTORY.forEach((c, i) => {
    for (const f of c.files) {
      mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
      cpSync(path.join(DIR, f), path.join(target, f));
    }
    const date = `2026-10-01T0${i + 1}:00:00+05:30`;
    git('add', '--', ...c.files);
    execFileSync('git', ['-C', target, 'commit', '-q', '-m', c.subject], {
      env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      stdio: 'pipe',
    });
  });
  return git('rev-parse', 'HEAD').toString().trim();
}

