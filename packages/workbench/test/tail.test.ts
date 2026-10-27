// The builder's edits as they happen (Stage 11): the tail sees each file a lift writes, before and after,
// a new file and a deleted one, and keeps them for the room in order; and the recorded build's English
// holds no developer word.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEdits, startTail } from '../src/tail.ts';
import { bannedWords } from '../src/explain.ts';

const work = mkdtempSync(path.join(tmpdir(), 'rama-tail-'));
const env = { ...process.env, RAMA_WORK_DIR: work };
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the tail of a lift', () => {
  it('keeps every change to a file, before and after, in order', async () => {
    const repo = path.join(work, 'chai', 'repo');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['-C', repo, 'init', '--quiet']);
    writeFileSync(path.join(repo, 'old.ts'), 'export const a = 1;\n');
    execFileSync('git', ['-C', repo, 'add', '-A']);
    const t = startTail(repo, 'chai', 1, { env, everyMs: 30 });
    writeFileSync(path.join(repo, 'new.ts'), 'export const b = 2;\n');
    await new Promise((r) => setTimeout(r, 120));
    writeFileSync(path.join(repo, 'new.ts'), 'export const b = 2;\nexport const c = 3;\n');
    unlinkSync(path.join(repo, 'old.ts'));
    const events = t.stop();
    expect(events.map((e) => [e.path, e.before, e.after])).toEqual(
      expect.arrayContaining([
        ['new.ts', null, 'export const b = 2;\n'],
        ['new.ts', 'export const b = 2;\n', 'export const b = 2;\nexport const c = 3;\n'],
        ['old.ts', 'export const a = 1;\n', null],
      ]),
    );
    expect(events.every((e) => e.lift === 1)).toBe(true);
    expect(readEdits('chai', 0, env)).toEqual(events);
    expect(readEdits('chai', events.length, env)).toEqual([]);
  });
});

describe('the recorded build’s English', () => {
  it('holds no developer word', () => {
    const dir = path.resolve(import.meta.dirname, '../../../fixtures/sample-build/explanations');
    const all = readdirSync(dir).map(
      (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { sentence: string },
    );
    expect(all.length).toBeGreaterThan(40);
    expect(all.flatMap((d) => bannedWords(d.sentence))).toEqual([]);
  });
});
