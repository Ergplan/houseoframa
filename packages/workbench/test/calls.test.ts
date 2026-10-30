// The trainer is called (Stage 13) only when the builder cannot get past a grey flag by itself; the call
// stays open, append-only, until a build of that product starts again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { answerCalls, callTrainer, openCalls } from '../src/calls.ts';

let work: string;
let env: NodeJS.ProcessEnv;
beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-calls-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('a trainer’s call', () => {
  it('stays open until a build of that product starts again, and is never edited', () => {
    const at = () => new Date('2026-10-31T10:00:00Z');
    const a = callTrainer(
      'bills',
      'The build stopped: 3 lifts in a row did not get past the checks.',
      'Press Start build again.',
      env,
      at,
    );
    callTrainer('stall', 'The build stopped.', null, env, at);
    expect(openCalls(null, env).map((c) => c.siteId)).toEqual(['bills', 'stall']);
    expect(openCalls('bills', env)).toEqual([a]);
    expect(answerCalls('bills', 'Rachit Agarwal', env, at)).toBe(1);
    expect(openCalls('bills', env)).toEqual([]);
    expect(openCalls(null, env).map((c) => c.siteId)).toEqual(['stall']);
    expect(answerCalls('bills', 'Rachit Agarwal', env, at)).toBe(0);
    const lines = readFileSync(path.join(work, '.calls.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: a.id, siteId: 'bills' });
    expect(JSON.parse(lines[2]!)).toMatchObject({ answers: a.id, by: 'Rachit Agarwal' });
  });
});
