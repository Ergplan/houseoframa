// Ask the code (Stage 13): the Explainer answers from the selected lines only, names only lines that were
// in the selection, says "The code does not say." when they do not answer, never shows an answer in
// developer words, and every question and answer is kept as a turn.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SiteLocation } from '@rama/blueprint/site';
import type { call } from '@rama/model';
import { AskError, askCode, askedTurns, selection } from '../src/ask.ts';

let work: string;
let env: NodeJS.ProcessEnv;
const site = {
  id: 'bills',
  repoDir: '/nowhere',
  name: 'Read my bill',
  kind: 'product',
} as SiteLocation;
const SOURCE = [
  "import { figure } from '../../rama/figures';",
  '',
  'const FIXED_CHARGE = 110;',
  'const DUTY = 0.05;',
  '',
  'export function charge(units: number, rate: number) {',
  '  const energy = units * rate;',
  '  return Math.round((energy + FIXED_CHARGE) * (1 + DUTY));',
  '}',
].join('\n');

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-ask-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const answering = (output: { answer: string; lines: number[]; said: boolean }) => {
  const seen: unknown[] = [];
  const fn = (async (req: { input: unknown; role: string; name: string }) => {
    seen.push(req);
    return { output, vendor: 'anthropic', model: 'claude-sonnet-5-5', callId: 'c1' };
  }) as unknown as typeof call;
  return { fn, seen };
};
const input = (q: string, from = 6, to = 9) => ({
  file: 'features/charge/charge.ts',
  plain: 'a part of “Work out the charge”',
  source: SOURCE,
  from,
  to,
  step: 'Work out the charge',
  figures: [{ title: 'You owe', what: 'What the bill comes to.' }],
  question: q,
  person: 'Meera Shah',
});

describe('ask the code', () => {
  it('sends the Explainer only the selected lines, numbered, with the file’s plain name, step and figures', async () => {
    const { fn, seen } = answering({
      answer: 'It adds the fixed charge and the duty to the energy.',
      lines: [7, 8],
      said: true,
    });
    const turn = await askCode(site, input('What does this do?'), { env, call: fn });
    const req = seen[0] as {
      name: string;
      role: string;
      input: { code: { line: number }[]; step: string; plain: string };
    };
    expect(req.name).toBe('ask');
    expect(req.role).toBe('drafter');
    expect(req.input.code.map((c) => c.line)).toEqual([6, 7, 8, 9]);
    expect(req.input.step).toBe('Work out the charge');
    expect(turn).toMatchObject({
      answer: 'It adds the fixed charge and the duty to the energy.',
      lines: [7, 8],
      said: true,
      person: 'Meera Shah',
      from: 6,
      to: 9,
    });
  });

  it('names only lines that were in the piece asked about', async () => {
    const { fn } = answering({
      answer: 'The fixed charge is set elsewhere in the file.',
      lines: [3, 8, 8, 40],
      said: true,
    });
    expect((await askCode(site, input('Why 110?'), { env, call: fn })).lines).toEqual([8]);
  });

  it('keeps "The code does not say." as said: false', async () => {
    const { fn } = answering({
      answer: 'The code does not say. It expects a number for the units.',
      lines: [6],
      said: false,
    });
    expect(
      await askCode(site, input('What if the bill has no units?'), { env, call: fn }),
    ).toMatchObject({ said: false });
  });

  it('never shows an answer in developer words', async () => {
    const { fn } = answering({
      answer: 'This function is an async API endpoint.',
      lines: [6],
      said: true,
    });
    const t = await askCode(site, input('What is it?'), { env, call: fn });
    expect(t.answer).toMatch(/not shown/);
    expect(t.said).toBe(false);
  });

  it('refuses an empty question or a selection outside the file, before any model is called', async () => {
    const { fn, seen } = answering({ answer: 'x', lines: [], said: true });
    await expect(askCode(site, input('   '), { env, call: fn })).rejects.toBeInstanceOf(AskError);
    await expect(askCode(site, input('Why?', 50, 60), { env, call: fn })).rejects.toBeInstanceOf(
      AskError,
    );
    expect(seen).toHaveLength(0);
    expect(() => selection(SOURCE, 0, 2)).toThrow(AskError);
  });

  it('keeps every question and answer as a turn, for the trainer to read', () => {
    const turns = askedTurns('bills', env);
    expect(turns.map((t) => t.question)).toEqual([
      'What does this do?',
      'Why 110?',
      'What if the bill has no units?',
      'What is it?',
    ]);
  });

  it('lets a failed call through, so the room can say the Explainer could not answer', async () => {
    const noKey = (async () => {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }) as unknown as typeof call;
    await expect(askCode(site, input('What does this do?'), { env, call: noKey })).rejects.toThrow(
      /not set/,
    );
  });
});
