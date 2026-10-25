#!/usr/bin/env node
// Builds the sample product (fixtures/sample-product, the Chai Stall) as a git repository with a fixed
// history of seven commits: the same files, authors, dates and messages every time, so the same commit
// SHAs and the same Blueprint come out of every run. Test drive (rule 16) and the tests start from it.
//
//   node scripts/make-sample.mjs <target dir>     (the target must not exist yet)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_DIR = fileURLToPath(new URL('../fixtures/sample-product', import.meta.url));

/** The history, oldest first: each commit adds these files from the fixture. */
export const SAMPLE_HISTORY = [
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

export function makeSample(target) {
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
  const git = (...args) => execFileSync('git', ['-C', target, ...args], { env, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  SAMPLE_HISTORY.forEach((c, i) => {
    for (const f of c.files) {
      mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
      cpSync(path.join(SAMPLE_DIR, f), path.join(target, f));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node scripts/make-sample.mjs <target dir>');
    process.exit(2);
  }
  console.log(makeSample(path.resolve(target)));
}
