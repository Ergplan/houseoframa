#!/usr/bin/env node
// Builds the sample product (the Chai Stall) as a git repository, as the builder built it: the house
// stack's own lift, then the builder's lifts, replayed from the recording of a real build
// (fixtures/sample-build, made by the build loop from the sample's decision cards and written by
// `pnpm record-build`). Each patch keeps its author, time and message, and the committer is its author,
// so the same commit SHAs and the same Blueprint come out of every run. Tests start from it; Test drive
// replays the same lifts through the build loop itself.
//
//   node scripts/make-sample.mjs <target dir>     (the target must not exist yet)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_BUILD = fileURLToPath(new URL('../fixtures/sample-build', import.meta.url));

/** The patches in order: the house stack's lift (0000-), then each of the builder's lifts. */
export function sampleLifts() {
  const rec = JSON.parse(readFileSync(path.join(SAMPLE_BUILD, 'lifts.json'), 'utf8'));
  const layDown = readdirSync(SAMPLE_BUILD).find((f) => f.startsWith('0000-'));
  if (!layDown) throw new Error('the recording holds no house stack lift');
  return [layDown, ...rec.lifts.map((l) => l.patch)];
}

export function makeSample(target) {
  if (existsSync(target)) throw new Error(`${target} already exists`);
  mkdirSync(target, { recursive: true });
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (...args) => execFileSync('git', ['-C', target, ...args], { env, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  for (const patch of sampleLifts()) {
    const head = readFileSync(path.join(SAMPLE_BUILD, patch), 'utf8');
    const from = /^From: "?([^"<\n]+?)"? <([^>]+)>$/m.exec(head);
    if (!from) throw new Error(`${patch} names no author`);
    execFileSync(
      'git',
      [
        '-C',
        target,
        'am',
        '--quiet',
        '--committer-date-is-author-date',
        path.join(SAMPLE_BUILD, patch),
      ],
      { env: { ...env, GIT_COMMITTER_NAME: from[1], GIT_COMMITTER_EMAIL: from[2] }, stdio: 'pipe' },
    );
  }
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
