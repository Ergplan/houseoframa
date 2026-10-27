// The builder's side of the room (Stage 10), on records kept in memory: acts 1 to 3 by voice, the brains
// asked with their rule read aloud, every card decided by the yes of the person who said it, scrap and
// restart, the commands that move the room, and the track answered from trails.
import { describe, expect, it } from 'vitest';
import type { Decision } from '@rama/shared';
import { seatProblems, type Seats } from '@rama/model';
import {
  agree,
  BRAINS_QUESTION,
  hear,
  startState,
  welcome,
  type RoomDeps,
  type RoomState,
} from '../src/conductor.ts';
import { ON_HAND } from './fixtures.ts';

function memoryRoom() {
  const turns: { speaker: string; text: string }[] = [];
  const cards: Decision[] = [];
  let seats: { seats: Partial<Seats>; chosen: boolean } = { seats: {}, chosen: false };
  let n = 0;
  const card = (
    title: string,
    statement: string,
    status: Decision['status'],
    by: string,
    supersedes?: string,
  ): Decision => ({
    id: `d${++n}`,
    siteId: 'chai',
    title,
    statement,
    bricks: [],
    status,
    by,
    at: `2026-10-27T10:00:${String(n).padStart(2, '0')}Z`,
    ...(supersedes ? { supersedes } : {}),
  });
  const inForce = () => cards.filter((d) => !cards.some((x) => x.supersedes === d.id));
  const deps: RoomDeps = {
    turn: async (speaker, text) => void turns.push({ speaker, text }),
    cards: async () => inForce(),
    yes: async (id, speaker) => {
      const c = cards.find((d) => d.id === id)!;
      const d = card(c.title, c.statement, 'decided', speaker, id);
      cards.push(d);
      return d;
    },
    record: async (c, speaker) => {
      const d = card(c.title, c.statement, 'decided', speaker);
      cards.push(d);
      return d;
    },
    scrap: async (speaker) => {
      for (const c of inForce()) cards.push(card(c.title, c.statement, 'withdrawn', speaker, c.id));
      return { name: `Scrapped by ${speaker}`, sessionId: 's2' };
    },
    seats: async () => seats,
    chooseSeats: async (s, speaker) => {
      const problems = seatProblems(s);
      if (!problems.length) {
        seats = { seats: s, chosen: true };
        cards.push(card('The brains', 'Claude Code builds; OpenAI checks.', 'decided', speaker));
      }
      return problems;
    },
    question: async () => null,
    narrate: async () => ({
      by: 'builder' as const,
      lines: [
        {
          building: 'See today’s orders',
          text: 'This building lists every order the stall has taken today.',
        },
        {
          building: 'Count the day’s takings',
          text: 'This building adds up the day’s takings and the GST on them.',
        },
        { building: null, text: 'What it will not do: it does not take a payment.' },
      ],
    }),
    buildings: () => [
      { id: 'see', name: 'See today’s orders', screens: [{ id: 'home', title: 'Today’s orders' }] },
      {
        id: 'count',
        name: 'Count the day’s takings',
        screens: [{ id: 'total', title: 'Today’s total' }],
      },
    ],
    figures: () => ON_HAND,
    whatIf: async (f, input, value) =>
      `If ${input} were ${value}, “${f.name}” would be worked out again.`,
  };
  const draft = (title: string, statement: string) =>
    cards.push(card(title, statement, 'open', 'Tara'));
  return { deps, turns, cards: () => inForce(), draft, seats: () => seats };
}

const say = async (deps: RoomDeps, s: RoomState, who: string, text: string) =>
  hear(deps, s, who, text);

describe('a rehearsal, act by act', () => {
  it('greets, asks the brains, reads each card, and takes every yes in the speaker’s name', async () => {
    const room = memoryRoom();
    room.draft('Money is kept in paise', 'Every amount is kept in paise.');
    room.draft('Building: Count the day’s takings', 'Adds up the day’s takings.');
    let s = startState('chai', 's1', ['Asha Rao', 'Tara']);
    expect(welcome(s)[0]!.text).toMatch(
      /^Welcome, Asha Rao and Tara\. I am the voice of House of Rama\. I ask, I read back, and I write nothing down myself/,
    );

    // Act 2: the idea, then the brains, with the rule read aloud.
    let r = await say(room.deps, s, 'Asha Rao', 'A chai stall takes orders through the day.');
    expect(r.lines.map((l) => l.text)).toEqual([BRAINS_QUESTION]);
    expect(BRAINS_QUESTION).toContain('the checker is never the builder');
    s = r.state;
    expect(s.act).toBe(2);

    // The same company for both is refused, aloud, with the rule.
    r = await say(room.deps, s, 'Asha Rao', 'Claude Code builds and Anthropic checks.');
    expect(r.lines[0]!.text).toBe(
      'The auditor cannot be Anthropic, the builder’s own vendor: the checker is never the builder. Which company checks?',
    );
    s = r.state;
    r = await say(
      room.deps,
      s,
      'Asha Rao',
      'Claude Code builds, OpenAI checks, Anthropic drafts and OpenAI speaks.',
    );
    expect(r.lines[0]!.text).toBe(
      'Claude Code, from Anthropic, builds; OpenAI checks; Anthropic drafts; OpenAI speaks. The checker is never the builder. Shall I write that down?',
    );
    s = r.state;
    r = await say(room.deps, s, 'Asha Rao', 'Yes.');
    expect(r.lines[0]!.text).toBe('Decided by Asha Rao: the brains.');
    expect(room.seats().chosen).toBe(true);
    // The next open card is read, and asked.
    expect(r.lines[1]!.text).toBe(
      'The card “Money is kept in paise”: Every amount is kept in paise. Shall I write this down as decided?',
    );
    s = r.state;

    // Talk while a card is asked is kept as a turn; the card stays asked.
    r = await say(room.deps, s, 'Tara', 'That is how the stall counts already.');
    expect(r.lines[0]!.text).toMatch(/^Noted\. Shall I write “Money is kept in paise” down/);
    s = r.state;
    r = await say(room.deps, s, 'Asha Rao', 'Yes, write it down.');
    expect(r.decided).toMatchObject({
      title: 'Money is kept in paise',
      status: 'decided',
      by: 'Asha Rao',
    });
    s = r.state;
    r = await say(room.deps, s, 'Tara', 'Yes');
    expect(r.decided).toMatchObject({ title: 'Building: Count the day’s takings', by: 'Tara' });
    expect(r.lines.at(-1)!.text).toMatch(/^Every card is decided\./);
    s = r.state;

    // Act 3: the design aloud, building by building, showing each, then "Shall I build this?".
    r = await agree(room.deps, s);
    // Drafted by the builder: said so first, and each drafted line marked unconfirmed (Invariant 6).
    expect(r.lines.map((l) => [l.kind, l.go, l.drafted])).toEqual([
      ['narration', undefined, undefined],
      ['narration', { level: 'building', building: 'see' }, 'builder'],
      ['narration', { level: 'building', building: 'count' }, 'builder'],
      ['narration', undefined, 'builder'],
      ['ask-build', { level: 'street' }, undefined],
    ]);
    expect(r.lines[0]!.text).toBe(
      'Here is the design, as the builder has drafted it from your cards. None of it is decided until you say yes.',
    );
    expect(r.lines[3]!.text).toMatch(/^What it will not do:/);
    expect(r.lines[4]!.text).toBe('That is the design. Shall I build this?');
    s = r.state;
    expect(s.act).toBe(3);
    r = await say(room.deps, s, 'Asha Rao', 'Yes, build it.');
    expect(r.decided).toMatchObject({ title: 'Yes, build it', status: 'decided', by: 'Asha Rao' });
    expect(r.decided!.statement).toMatch(
      /^Asha Rao said yes to the design as it was explained aloud: \(the builder’s draft, confirmed by this yes\) This building lists/,
    );
    expect(r.lines[0]!.text).toMatch(
      /^Signed: Asha Rao said yes, build it\. That is the first signature\./,
    );
    expect(r.state.act).toBe(4);

    // Every utterance is a turn with its speaker; every line the voice was given is kept for the check.
    expect(room.turns.map((t) => t.speaker)).toEqual([
      'Asha Rao',
      'Asha Rao',
      'Asha Rao',
      'Asha Rao',
      'Tara',
      'Asha Rao',
      'Tara',
      'Asha Rao',
    ]);
    expect(r.state.given.length).toBeGreaterThan(10);
  });

  it('will not explain the design while a card is open, and a yes to nothing decides nothing', async () => {
    const room = memoryRoom();
    room.draft('What it will not do', 'It takes no payment.');
    const s = startState('chai', 's1', ['Asha Rao']);
    expect((await agree(room.deps, s)).lines[0]!.text).toBe(
      'Not yet: one card is still open, “What it will not do”. Every card is decided before the design is explained.',
    );
    const r = await say(room.deps, s, 'Asha Rao', 'yes');
    expect(r.decided).toBeUndefined();
    expect(r.lines[0]!.text).toBe('There is nothing to say yes to yet.');
  });

  it('scraps everything only after a yes, keeping the cards, and starts a named draft', async () => {
    const room = memoryRoom();
    room.draft('Money is kept in paise', 'Every amount is kept in paise.');
    let s: RoomState = { ...startState('chai', 's1', ['Asha Rao']), act: 2 };
    let r = await say(room.deps, s, 'Asha Rao', 'Scrap everything.');
    expect(r.lines[0]!.text).toMatch(/^Scrap everything\? Every card is withdrawn and kept/);
    expect(room.cards().every((c) => c.status === 'open')).toBe(true);
    s = r.state;
    r = await say(room.deps, s, 'Asha Rao', 'yes');
    expect(r.lines[0]!.text).toBe(
      'Scrapped. Every card is withdrawn and kept, and a new draft is started: “Scrapped by Asha Rao”.',
    );
    expect(room.cards().map((c) => [c.status, c.by])).toEqual([['withdrawn', 'Asha Rao']]);
    expect(r.state.sessionId).toBe('s2');
  });
});

describe('commands that move the room, and the track', () => {
  const s0 = { ...startState('chai', 's1', ['Asha Rao']), act: 2 as const };
  it('shows a building, opens a screen, shows the code, goes back', async () => {
    const { deps } = memoryRoom();
    let r = await hear(deps, s0, 'Asha Rao', 'Show me count the day’s takings');
    expect(r.go).toEqual({ level: 'building', building: 'count' });
    expect(r.lines[0]!.text).toBe('Here is “Count the day’s takings”.');
    r = await hear(deps, r.state, 'Asha Rao', 'Open today’s total');
    expect(r.go).toEqual({ level: 'screen', screen: 'total', building: 'count' });
    r = await hear(deps, r.state, 'Asha Rao', 'Show me the code');
    expect(r.go).toEqual({ level: 'code', building: 'count' });
    r = await hear(deps, r.state, 'Asha Rao', 'Go back');
    expect(r.go).toEqual({ level: 'screen', screen: 'total', building: 'count' });
    r = await hear(deps, r.state, 'Asha Rao', 'Show me payroll');
    expect(r.go).toBeUndefined();
    expect(r.lines[0]!.text).toBe(
      'There is no building called “payroll”. The buildings are “See today’s orders” and “Count the day’s takings”.',
    );
  });

  it('answers a track question from the trail of the figure named, or in front', async () => {
    const { deps } = memoryRoom();
    let r = await hear(deps, s0, 'Asha Rao', 'Where does this number come from?');
    expect(r.lines[0]!.text).toBe(
      'Which number? Here there are “Today’s takings”, “GST on today’s takings” and “Tip jar”.',
    );
    r = await hear(deps, s0, 'Asha Rao', 'How is GST on today’s takings worked out?');
    expect(r.lines[0]!.text).toBe(
      '“GST on today’s takings” is worked out like this: five percent of the day’s takings, rounded to the paisa.',
    );
    // "this number" is now that figure.
    r = await hear(deps, r.state, 'Asha Rao', 'Who signed it?');
    expect(r.lines[0]!.text).toBe('Nobody has signed the screen “Today’s total” yet.');
    r = await hear(deps, s0, 'Asha Rao', 'Where does tip jar come from?');
    expect(r.lines[0]!.text).toMatch(/^“Tip jar” is untraced/);
    r = await hear(deps, r.state, 'Asha Rao', 'What if the cups were three?');
    expect(r.lines[0]!.text).toBe('If cups were 3, “Tip jar” would be worked out again.');
  });

  it('reads the board on request, as a draft', async () => {
    const { deps } = memoryRoom();
    const r = await hear(deps, s0, 'Tara', 'Read the board');
    expect(r.board).toBe(true);
    expect(r.lines[0]!.text).toMatch(/nothing is decided from it/);
  });
});
