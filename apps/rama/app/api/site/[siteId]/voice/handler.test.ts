// The voice's routes (Stage 10): the room opens with the people in it, each utterance goes in with its
// speaker and comes back as lines to read with the events that make the voice read them, what the voice
// said is checked against the lines it was given before it is kept, and the audio session and the
// board go through their own deps. A room that is not open refuses everything but a start.
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import type { RoomState } from '@rama/ears';
import {
  handleAgree,
  handleBoard,
  handleEnd,
  handleHeard,
  handleSaid,
  handleSession,
  handleStart,
  handleTell,
  placeUrl,
  type VoiceDeps,
} from './handler';

const site = { id: 'chai', name: 'Chai Stall', kind: 'product' } as unknown as SiteLocation;
const tara: Member = { id: 't1', name: 'Tara', email: null, role: 'trainer' };

function deps() {
  let room: RoomState | null = null;
  const turns: [string, string][] = [];
  const d: VoiceDeps = {
    room: () => room,
    save: (s) => void (room = s),
    members: () => ['Tara', 'Asha Rao'],
    startSession: vi.fn(async () => 's1'),
    hear: vi.fn(async (_site, state, speaker, text) => ({
      lines: [
        {
          kind: 'card' as const,
          text: `Heard ${speaker}: ${text}. The card “Money is kept in paise”: 1,500 paise a cup. Shall I write this down as decided?`,
        },
      ],
      go: { level: 'building' as const, building: 'count' },
      state: {
        ...state,
        act: 2 as const,
        given: [...state.given, 'The card “Money is kept in paise”: 1,500 paise a cup.'],
      },
    })),
    agree: vi.fn(async (_site, state) => ({
      lines: [{ kind: 'ask-build' as const, text: 'That is the design. Shall I build this?' }],
      state: { ...state, act: 3 as const },
    })),
    turn: vi.fn(async (_s, _id, speaker, text) => void turns.push([speaker, text])),
    events: async (lines) =>
      lines.map((l) => ({ ...l, event: { type: 'response.create', text: l.text } })),
    open: vi.fn(async () => ({ sdp: 'v=0 answer', callId: 'row-1' })),
    line: vi.fn(async () => {}),
    board: vi.fn(async () => ({
      at: 'x',
      by: 'Tara',
      frame: 'x.jpg',
      reading: { boxes: [], arrows: [], labels: [] },
      loose: 0,
      vendor: 'anthropic',
      model: 'm',
      callId: 'c',
      draft: true as const,
    })),
    now: () => new Date('2026-10-27T10:00:00Z'),
    flowStep: (_s, key, step) =>
      key === 'todays-total/todays-takings' && step === 0 ? '4 rows left data/orders.json.' : null,
  };
  return { d, turns, room: () => room };
}

const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe('the voice’s routes', () => {
  it('refuse everything but a start while the room is not open', async () => {
    const { d } = deps();
    expect((await handleHeard(site, { speaker: 'Tara', text: 'Yes' }, d)).status).toBe(409);
    expect((await handleSaid(site, tara, { text: 'Yes' }, d)).status).toBe(409);
    expect((await handleAgree(site, d)).status).toBe(409);
    expect((await handleSession(site, tara, 'v=0', d)).status).toBe(409);
    expect((await handleEnd(site, d)).status).toBe(200);
  });

  it('POST voice/start opens the room with members only, and greets them', async () => {
    const { d, room } = deps();
    expect(await body(await handleStart(site, tara, { people: ['Tara', 'Stranger'] }, d))).toEqual({
      ok: false,
      sentence: 'Stranger is not in members.json.',
    });
    const r = await body(await handleStart(site, tara, { people: ['Asha Rao', 'Tara'] }, d));
    expect(r.act).toBe(1);
    expect((r.lines as { text: string; event: unknown }[])[0]!.text).toMatch(
      /^Welcome, Asha Rao and Tara\./,
    );
    expect((r.lines as { event: unknown }[])[0]!.event).toMatchObject({ type: 'response.create' });
    expect(room()).toMatchObject({ sessionId: 's1', people: ['Asha Rao', 'Tara'], act: 1 });
    expect(room()!.given).toHaveLength(1);
  });

  it('POST voice/heard takes one utterance from a person in the room, and says where to look', async () => {
    const { d } = deps();
    await handleStart(site, tara, { people: ['Asha Rao'] }, d);
    expect((await handleHeard(site, { speaker: 'Tara', text: 'Yes' }, d)).status).toBe(400);
    const r = await body(
      await handleHeard(site, { speaker: 'Asha Rao', text: 'Yes', focus: 'total/x' }, d),
    );
    expect(d.hear).toHaveBeenCalledWith(
      site,
      expect.objectContaining({ focus: 'total/x' }),
      'Asha Rao',
      'Yes',
    );
    expect(r).toMatchObject({
      ok: true,
      act: 2,
      go: '/site/chai?b=count',
      board: false,
      decided: null,
    });
  });

  it('POST voice/said keeps what the voice said, and flags a number no line gave it', async () => {
    const { d, turns } = deps();
    await handleStart(site, tara, { people: ['Asha Rao'] }, d);
    await handleHeard(site, { speaker: 'Asha Rao', text: 'hello' }, d);
    expect(
      await body(await handleSaid(site, tara, { text: 'Fifteen hundred paise a cup.' }, d)),
    ).toEqual({
      ok: true,
      mouth: { ok: true, unsupported: [] },
    });
    expect(
      await body(await handleSaid(site, tara, { text: 'GST is eighteen percent.' }, d)),
    ).toEqual({
      ok: true,
      mouth: { ok: false, unsupported: [18] },
    });
    expect(turns).toEqual([
      ['Rama', 'Fifteen hundred paise a cup.'],
      ['Rama', 'GST is eighteen percent.'],
      [
        'House of Rama',
        "The voice said 18, which no line handed to it holds. It is not part of the record; the builder's lines are.",
      ],
    ]);
  });

  it('POST voice/agree, voice/session, voice/said from the live voice, and voice/end', async () => {
    const { d, room } = deps();
    await handleStart(site, tara, { people: ['Asha Rao'] }, d);
    expect(await body(await handleAgree(site, d))).toMatchObject({ act: 3 });
    expect((await handleSession(site, tara, 'not sdp', d)).status).toBe(400);
    const s = await handleSession(site, tara, 'v=0 offer', d);
    expect(await s.text()).toBe('v=0 answer');
    expect(s.headers.get('content-type')).toBe('application/sdp');
    expect(room()!.voiceCall).toBe('row-1');
    // Each line the live voice read is its own row, with what the vendor counted for it.
    const usage = { inputTokens: 120, outputTokens: 340, ms: 2100 };
    expect(
      (await handleSaid(site, tara, { text: 'Hello.', usage: { ...usage, inputTokens: -1 } }, d))
        .status,
    ).toBe(400);
    await handleSaid(
      site,
      tara,
      {
        text: 'That is the design. Shall I build this?',
        line: 'That is the design. Shall I build this?',
        usage,
      },
      d,
    );
    expect(d.line).toHaveBeenCalledWith(site, tara, {
      line: 'That is the design. Shall I build this?',
      said: 'That is the design. Shall I build this?',
      ...usage,
    });
    await handleEnd(site, d);
    expect(room()!.endedAt).toBe('2026-10-27T10:00:00.000Z');
    expect((await handleHeard(site, { speaker: 'Asha Rao', text: 'Yes' }, d)).status).toBe(409);
  });

  it('a voice that cannot start says why', async () => {
    const { d } = deps();
    d.open = async () => {
      throw new Error('OPENAI_API_KEY is not set: enter the OpenAI key in Settings');
    };
    await handleStart(site, tara, { people: ['Asha Rao'] }, d);
    expect(await body(await handleSession(site, tara, 'v=0', d))).toEqual({
      ok: false,
      sentence:
        'The voice could not start: OPENAI_API_KEY is not set: enter the OpenAI key in Settings',
    });
  });

  it('POST board reads one frame, and refuses anything else', async () => {
    const { d } = deps();
    expect((await handleBoard(site, tara, { mediaType: 'image/gif', base64: 'x' }, d)).status).toBe(
      400,
    );
    expect(
      await body(await handleBoard(site, tara, { mediaType: 'image/jpeg', base64: 'AAAA' }, d)),
    ).toMatchObject({
      ok: true,
      board: { draft: true },
    });
    expect(d.board).toHaveBeenCalledWith(site, tara, { mediaType: 'image/jpeg', base64: 'AAAA' });
  });

  it('POST voice/tell hands a step of a flow to the voice as a builder line, counted by the mouth check', async () => {
    const { d, room } = deps();
    const step = { figure: 'todays-total/todays-takings', step: 0 };
    expect(await body(await handleTell(site, step, d))).toEqual({ ok: true, lines: [] });
    await handleStart(site, tara, { people: ['Asha Rao'] }, d);
    // Text of the page's own is not taken: only a step of a flow House of Rama derived.
    expect((await handleTell(site, { text: 'GST is 18%.' }, d)).status).toBe(400);
    expect((await handleTell(site, { ...step, step: 9 }, d)).status).toBe(404);
    const r = await body(await handleTell(site, step, d));
    expect((r.lines as { text: string }[])[0]!.text).toBe('4 rows left data/orders.json.');
    expect(room()!.given).toContain('4 rows left data/orders.json.');
    expect(
      await body(await handleSaid(site, tara, { text: 'Four rows left the orders file.' }, d)),
    ).toMatchObject({ mouth: { ok: true } });
  });

  it('places become addresses: the Street, a building, the code, a screen', () => {
    expect(placeUrl('chai', { level: 'street' })).toBe('/site/chai');
    expect(placeUrl('chai', { level: 'building', building: 'count' })).toBe('/site/chai?b=count');
    expect(placeUrl('chai', { level: 'code', building: 'count' })).toBe(
      '/site/chai?at=code&b=count',
    );
    expect(placeUrl('chai', { level: 'screen', screen: 'total', building: 'count' })).toBe(
      '/site/chai/showroom?screen=total',
    );
  });
});
