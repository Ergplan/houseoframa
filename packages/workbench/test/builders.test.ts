// The builders (Stage 9 seats): Claude Code is wired; Codex, Gemini CLI and Antigravity are stubs that
// say so and build nothing; a build started with one stops at once with that sentence as a grey flag.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProductSite, type SiteLocation } from '@rama/blueprint/site';
import { BUILDER_VENDOR } from '@rama/model';
import { build } from '../src/build.ts';
import {
  antigravity,
  builderFor,
  BuilderNotWired,
  codex,
  geminiCli,
} from '../src/builders/index.ts';
import type { Step } from '../src/jobs.ts';
import { BUILDER_OPTIONS } from '../src/seats.ts';

let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-builders-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  site = createProductSite({ id: 'chai', name: 'Chai', idea: 'Chai.', env }, (repoDir) =>
    execFileSync('git', ['-C', repoDir, 'init', '--quiet']),
  );
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the builders', () => {
  it('Claude Code is wired; each stub reports itself unwired, by name and company, and builds nothing', async () => {
    expect(builderFor('claude-code').wired).toBe(true);
    for (const [stub, says] of [
      [codex, 'Codex (OpenAI) is not wired as a builder yet'],
      [geminiCli, 'Gemini CLI (Google) is not wired as a builder yet'],
      [antigravity, 'Antigravity (Google) is not wired as a builder yet'],
    ] as const) {
      expect(stub.wired).toBe(false);
      const lift = stub.lift({} as never);
      await expect(lift).rejects.toBeInstanceOf(BuilderNotWired);
      await expect(lift).rejects.toThrow(says);
    }
    expect(BUILDER_OPTIONS.map((b) => [b.id, b.vendor, b.wired])).toEqual([
      ['claude-code', 'anthropic', true],
      ['codex', 'openai', false],
      ['gemini-cli', 'gemini', false],
      ['antigravity', 'gemini', false],
    ]);
    expect(BUILDER_VENDOR['claude-code']).toBe('anthropic');
  });

  it('a build with a stub stops at once with its sentence and the next action, and touches nothing', async () => {
    const steps: { name: string; ok: boolean; sentence: string; next?: string }[] = [];
    const step: Step = async (name, run, next) => {
      try {
        steps.push({ name, ok: true, sentence: await run() });
      } catch (err) {
        steps.push({
          name,
          ok: false,
          sentence: (err as Error).message,
          ...(next ? { next } : {}),
        });
        throw err;
      }
    };
    const noDb = (() => {
      throw new Error('no database is needed to refuse');
    }) as never;
    await expect(build(noDb, step, site, { driver: codex, person: 'Tara', env })).rejects.toThrow(
      BuilderNotWired,
    );
    expect(steps).toEqual([
      {
        name: 'Builder',
        ok: false,
        sentence:
          'Codex (OpenAI) is not wired as a builder yet, so it cannot build. Choose Claude Code as the builder in Settings → Brains.',
        next: 'Choose Claude Code as the builder in Settings → Brains, then press Start build.',
      },
    ]);
    expect(execFileSync('git', ['-C', site.repoDir, 'status', '--porcelain']).toString()).toBe('');
  });
});
