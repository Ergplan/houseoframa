// Builds throwaway git repositories with fixed authors and dates, so their history is reproducible.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface FixtureRepo {
  dir: string;
  write: (files: Record<string, string | Buffer>) => void;
  remove: (...paths: string[]) => void;
  git: (...args: string[]) => string;
  commit: (subject: string, author?: string) => string;
  cleanup: () => void;
}

export function fixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(path.join(tmpdir(), 'rama-fixture-'));
  let tick = 0;
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  return {
    dir,
    git,
    write(files) {
      for (const [p, content] of Object.entries(files)) {
        const full = path.join(dir, p);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    },
    remove(...paths) {
      for (const p of paths) rmSync(path.join(dir, p));
    },
    commit(subject, author = 'Asha Builder') {
      tick++;
      const date = `2026-01-0${Math.min(tick, 9)}T10:00:0${tick % 10}+05:30`;
      git('add', '-A');
      execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', subject], {
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_AUTHOR_NAME: author,
          GIT_AUTHOR_EMAIL: 'builder@example.com',
          GIT_COMMITTER_NAME: author,
          GIT_COMMITTER_EMAIL: 'builder@example.com',
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      });
      return git('rev-parse', 'HEAD').trim();
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
