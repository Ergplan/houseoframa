import { describe, expect, it, vi } from 'vitest';
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import type { SiteLocation } from '@rama/blueprint/site';
import { ChainError, checkChain } from '@rama/ceremony/records';
import {
  handleAsk,
  handleDecide,
  handleSign,
  handleStartSession,
  handleTurn,
  type CeremonyDeps,
} from './ceremony';

const site = { id: 'shop', name: 'Shop', repoDir: '/tmp/shop' } as unknown as SiteLocation;
const bp = {
  commit: 'c0ffee1234',
  nodes: [{ path: 'app/page.tsx' }, { path: 'lib/total.ts' }],
  screens: [{ id: '/', route: '/', bricks: ['app/page.tsx'] }],
} as unknown as Blueprint;
const SESSION = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-10-22T10:00:00Z');

/** An in-memory ceremony: signatures keep their chain rules, as the real store does. */
function deps(over: Partial<CeremonyDeps> = {}) {
  const sigs: Signoff[] = [];
  const cards: Decision[] = [];
  const turns: { speaker: string; text: string; draft?: boolean }[] = [];
  const d: CeremonyDeps = {
    locate: (id) => (id === 'shop' ? site : null),
    blueprint: () => bp,
    capturedCommit: () => 'abc1234567',
    memberName: 'Asha Rao',
    personId: async () => 'person-1',
    signoffs: async () => sigs,
    sign: async (_s, input) => {
      const s: Signoff = {
        id: `s${sigs.length + 1}`,
        siteId: 'shop',
        person: input.person,
        target: input.target,
        statement: input.statement,
        at: input.at.toISOString(),
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
        ...(input.withdrawn ? { withdrawn: true } : {}),
      };
      checkChain(sigs, s);
      sigs.push(s);
      return s;
    },
    decide: async (_s, input) => {
      const c = {
        id: `d${cards.length + 1}`,
        siteId: 'shop',
        ...input,
        at: input.at.toISOString(),
      } as unknown as Decision;
      cards.push(c);
      return c;
    },
    startSession: async () => SESSION,
    addTurn: async (_s, _id, t) => void turns.push(t),
    sessionTurns: async (_s, id) => (id === SESSION ? [...turns] : null),
    decisions: async () => cards,
    draftQuestion: async () => 'Who signs a bill?',
    now: () => at,
    ...over,
  };
  return { d, sigs, cards, turns };
}
const json = async (r: Response) => ({
  status: r.status,
  body: (await r.json()) as Record<string, unknown>,
});
const body = { screenId: '/', commit: 'abc1234567', statement: 'Home shows the total.' };

describe('POST /api/site/[siteId]/sign', () => {
  it('signs a screen at the captured commit as the local member', async () => {
    const { d, sigs } = deps();
    const r = await json(await handleSign('shop', body, d));
    expect(r.status).toBe(200);
    expect(sigs).toEqual([
      {
        id: 's1',
        siteId: 'shop',
        person: 'Asha Rao',
        target: { kind: 'screen', id: '/', commit: 'abc1234567' },
        statement: 'Home shows the total.',
        at: at.toISOString(),
      },
    ]);
  });

  it('signing again supersedes the signature in force; a withdrawal supersedes and withdraws it', async () => {
    const { d, sigs } = deps();
    await handleSign('shop', body, d);
    await handleSign('shop', body, d);
    expect(sigs[1]!.supersedes).toBe('s1');
    expect(
      (await handleSign('shop', { ...body, withdraw: true, statement: 'Wrong total.' }, d)).status,
    ).toBe(200);
    expect(sigs[2]).toMatchObject({ supersedes: 's2', withdrawn: true });
    expect((await json(await handleSign('shop', { ...body, withdraw: true }, d))).status).toBe(409);
  });

  it('refuses a stale page, an unknown screen or site, a bad body, and a missing member', async () => {
    const { d } = deps();
    expect((await handleSign('shop', { ...body, commit: 'old0000' }, d)).status).toBe(409);
    expect((await handleSign('shop', { ...body, screenId: '/nope' }, d)).status).toBe(404);
    expect((await handleSign('nope', body, d)).status).toBe(404);
    expect((await handleSign('shop', { screenId: '/' }, d)).status).toBe(400);
    expect((await handleSign('shop', body, deps({ memberName: ' ' }).d)).status).toBe(409);
    expect((await handleSign('shop', body, deps({ capturedCommit: () => null }).d)).status).toBe(
      409,
    );
    expect(
      (
        await handleSign(
          'shop',
          body,
          deps({ personId: async () => Promise.reject(new Error('db down')) }).d,
        )
      ).status,
    ).toBe(503);
  });

  it('answers a broken chain with 409, a pending mirror line as recorded with a warning, and lets other errors through', async () => {
    const chain = deps({
      sign: async () => {
        throw new ChainError('s1 is already superseded');
      },
    }).d;
    expect((await handleSign('shop', body, chain)).status).toBe(409);
    const pending = Object.assign(
      new Error('s1 is recorded, but .rama/signoffs.jsonl could not be written'),
      {
        name: 'MirrorError',
        record: { id: 's1' },
      },
    );
    const late = await json(
      await handleSign('shop', body, deps({ sign: async () => Promise.reject(pending) }).d),
    );
    expect(late).toEqual({
      status: 200,
      body: { ok: true, record: { id: 's1' }, warning: pending.message },
    });
    const boom = deps({ sign: async () => Promise.reject(new Error('disk full')) }).d;
    await expect(handleSign('shop', body, boom)).rejects.toThrow('disk full');
  });
});

describe('POST /api/site/[siteId]/decisions', () => {
  it('records a card by the member, naming only real bricks and screens', async () => {
    const { d, cards } = deps();
    const r = await handleDecide(
      'shop',
      {
        title: 'Totals',
        statement: 'In rupees.',
        status: 'decided',
        bricks: ['lib/total.ts'],
        screenId: '/',
      },
      d,
    );
    expect(r.status).toBe(200);
    expect(cards[0]).toMatchObject({
      title: 'Totals',
      by: 'Asha Rao',
      createdBy: 'person-1',
      bricks: ['lib/total.ts'],
    });
    expect(
      (
        await handleDecide(
          'shop',
          { title: 'x', statement: 'x', status: 'decided', bricks: ['nope.ts'] },
          d,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handleDecide(
          'shop',
          { title: 'x', statement: 'x', status: 'decided', screenId: '/nope' },
          d,
        )
      ).status,
    ).toBe(404);
    expect(
      (await handleDecide('shop', { title: 'x', statement: 'x', status: 'maybe' }, d)).status,
    ).toBe(400);
    const taken = deps({
      decide: async () => Promise.reject(new Error('decision d1 is already superseded')),
    }).d;
    expect(
      (await handleDecide('shop', { title: 'x', statement: 'x', status: 'open' }, taken)).status,
    ).toBe(409);
  });
});

describe('POST /api/site/[siteId]/discovery/*', () => {
  it("starts a session and records the member's turns", async () => {
    const { d, turns } = deps();
    expect((await json(await handleStartSession('shop', { title: 'Kick-off' }, d))).body).toEqual({
      ok: true,
      sessionId: SESSION,
    });
    expect((await handleStartSession('shop', {}, d)).status).toBe(400);
    expect(
      (await handleTurn('shop', { sessionId: SESSION, text: 'We bill from a phone.' }, d)).status,
    ).toBe(200);
    expect(turns).toEqual([
      { speaker: 'Asha Rao', text: 'We bill from a phone.', at, createdBy: 'person-1' },
    ]);
    expect(
      (
        await handleTurn(
          'shop',
          { sessionId: '22222222-2222-4222-8222-222222222222', text: 'x' },
          d,
        )
      ).status,
    ).toBe(404);
  });

  it("stores Rama's question as a draft turn, never a decision, and reports a model failure as 502", async () => {
    const draft = vi.fn(async () => 'Who signs a bill?');
    const { d, turns, cards } = deps({ draftQuestion: draft });
    const r = await json(await handleAsk('shop', { sessionId: SESSION }, d));
    expect(r.body).toEqual({ ok: true, question: 'Who signs a bill?' });
    expect(draft).toHaveBeenCalledWith({ site: 'Shop', turns: [], decisions: [] }, 'shop');
    expect(turns).toEqual([
      {
        speaker: 'Rama',
        text: 'Who signs a bill?',
        draft: true,
        at,
        createdBy: 'rama:ceremony-discovery@0.1.0',
      },
    ]);
    expect(cards).toEqual([]);
    const down = deps({ draftQuestion: async () => Promise.reject(new Error('timeout')) }).d;
    expect((await handleAsk('shop', { sessionId: SESSION }, down)).status).toBe(502);
  });
});
