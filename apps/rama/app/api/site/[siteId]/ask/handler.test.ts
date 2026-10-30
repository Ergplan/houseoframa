// The ask route (Stage 13): its input checked, a file not there refused, an Explainer that cannot answer
// said in plain words (503), and an answer passed through as the turn.
import { describe, expect, it } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import { AskError, type AskedTurn } from '@rama/workbench';
import { handleAsk, handleAsked, type AskDeps } from './handler';

const site = { id: 'bills', repoDir: '/x', name: 'Read my bill', kind: 'product' } as SiteLocation;
const who = { id: 'p1', name: 'Meera Shah', role: 'customer' } as Member;
const turn: AskedTurn = {
  at: '2026-10-30T10:00:00Z',
  person: 'Meera Shah',
  file: 'a.ts',
  from: 1,
  to: 2,
  question: 'Why?',
  answer: 'Because line 2 says so.',
  lines: [2],
  said: true,
  vendor: 'anthropic',
  model: 'm',
};
const deps = (over: Partial<AskDeps> = {}): AskDeps => ({
  source: () => 'line one\nline two\n',
  about: () => ({ plain: null, step: null }),
  figures: () => [],
  ask: async () => turn,
  turns: () => [turn],
  ...over,
});
const body = { path: 'a.ts', from: 1, to: 2, question: 'Why?' };

describe('POST ask', () => {
  it('answers with the turn', async () => {
    const r = await handleAsk(site, who, body, deps());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, turn });
  });
  it('refuses a malformed body, a path outside the product, and a file not there', async () => {
    expect((await handleAsk(site, who, { path: 'a.ts' }, deps())).status).toBe(400);
    expect((await handleAsk(site, who, { ...body, path: '../etc/passwd' }, deps())).status).toBe(
      400,
    );
    expect((await handleAsk(site, who, body, deps({ source: () => null }))).status).toBe(404);
  });
  it('says a refusal of the question plainly (400) and an Explainer that cannot answer (503)', async () => {
    const bad = await handleAsk(
      site,
      who,
      body,
      deps({
        ask: async () => {
          throw new AskError('Ask one shorter question at a time.');
        },
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).sentence).toBe('Ask one shorter question at a time.');
    const down = await handleAsk(
      site,
      who,
      body,
      deps({
        ask: async () => {
          throw new Error('ANTHROPIC_API_KEY is not set');
        },
      }),
    );
    expect(down.status).toBe(503);
    expect((await down.json()).sentence).toMatch(
      /The Explainer could not answer: ANTHROPIC_API_KEY is not set.*Settings/,
    );
  });
});

describe('GET ask', () => {
  it('gives the questions asked so far', async () => {
    expect(await handleAsked(site, deps()).json()).toEqual({ ok: true, turns: [turn] });
  });
});
