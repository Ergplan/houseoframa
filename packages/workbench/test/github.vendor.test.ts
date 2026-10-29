// @vendor: creates one real, private GitHub repository through the client, under GITHUB_OWNER with the
// token in GITHUB_TOKEN, and pushes a commit to it. It is outward-facing (it leaves a repository behind,
// named rama-vendor-check-<random>), so it runs only on request:
// `RAMA_VENDOR_TESTS=1 GITHUB_TOKEN=… GITHUB_OWNER=… pnpm vitest run --project @rama/workbench github.vendor`.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRepository, GITHUB_API, pushTo, viewer } from '../src/github.ts';

describe('@vendor GitHub', () => {
  it('@vendor creates a private repository under the owner and receives a push', async () => {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    expect(token, 'GITHUB_TOKEN').toBeTruthy();
    expect(owner, 'GITHUB_OWNER').toBeTruthy();
    const deps = { fetch: globalThis.fetch, api: GITHUB_API };
    expect(await viewer(token!, deps)).toBeTruthy();
    const name = `rama-vendor-check-${randomBytes(3).toString('hex')}`;
    const repo = await createRepository(token!, owner!, name, 'House of Rama vendor check', deps);
    expect(repo.fullName.toLowerCase()).toBe(`${owner}/${name}`.toLowerCase());
    expect(repo.cloneUrl).not.toContain(token!);
    const dir = mkdtempSync(path.join(tmpdir(), 'rama-gh-'));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main', dir]);
      writeFileSync(path.join(dir, 'README.md'), '# vendor check\n');
      execFileSync('git', ['-C', dir, 'add', '-A']);
      execFileSync('git', [
        '-C',
        dir,
        '-c',
        'user.name=rama',
        '-c',
        'user.email=rama@example.invalid',
        'commit',
        '-qm',
        'check',
      ]);
      await pushTo(dir, repo.cloneUrl, token!);
      const remote = execFileSync('git', ['ls-remote', repo.cloneUrl], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'http.extraHeader',
          GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
        },
      });
      expect(remote).toContain('refs/heads/main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
