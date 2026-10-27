// The builder's side of the room (Stage 10). A person speaks; what they said is stored as a turn with
// their name; then it is read as a command or as talk, and the reply is what House of Rama hands the
// voice to read (builder lines), where to look, and what was decided. The voice decides nothing and
// writes nothing: a card is decided here, by the person whose yes it was, to the question the voice
// was given to ask (Invariant 9). Plain code except two drafted texts, each a builder line: the next
// question (drafter seat) and the design explained aloud (narrate.v2).
import type { Decision } from '@rama/shared';
import { seatProblems, type Seats } from '@rama/model';
import { brainsSpoken, parseBrains } from './brains.ts';
import { matchName, parseCommand, type CameraMove, type TrackStep } from './grammar.ts';
import { spokenNumber } from './numbers.ts';
import { answerTrack, type FigureOnHand } from './track.ts';

/** Where the room is looking: the lakefront's levels, and a screen's own picture. */
export type Place =
  | { level: 'street' }
  | { level: 'building'; building: string }
  | { level: 'code'; building?: string }
  | { level: 'screen'; screen: string; building?: string };

export type LineKind =
  | 'welcome'
  | 'question'
  | 'card'
  | 'readback'
  | 'ack'
  | 'track'
  | 'what-if'
  | 'narration'
  | 'ask-build'
  | 'refusal';

/** A builder line: the only text the voice is given to say. */
export interface Line {
  kind: LineKind;
  text: string;
  /** Where to look while it is read (act 3 shows each building as it is explained). */
  go?: Place;
  /**
   * Drafted by a model and unconfirmed (Invariant 6): the builder's narration, which stands only once a
   * named person says yes to it, or the drafter's next question, which decides nothing. Fixed lines,
   * read-backs and the cards as decided are not drafts.
   */
  drafted?: 'builder' | 'drafter';
}

/** The session's acts: 1 arrive, 2 ideate, 3 agree (the design explained aloud), 4 agreed. */
export type Act = 1 | 2 | 3 | 4;

export type Asked =
  | { kind: 'brains-question' }
  | { kind: 'brains'; seats: Seats }
  | { kind: 'card'; id: string; title: string }
  | { kind: 'question' }
  | { kind: 'scrap' }
  | { kind: 'build'; statement: string };

export interface RoomState {
  siteId: string;
  /** The discovery session the turns go into. */
  sessionId: string;
  act: Act;
  /** The people in the room, by name: each has a button to talk. */
  people: string[];
  /** The question the voice was last given to ask, which a yes or a no answers. */
  asked: Asked | null;
  place: Place;
  history: Place[];
  /** The figure in front of the person ("this number"), by key. */
  focus: string | null;
  /** Every line handed to the voice in this session, for the mouth check. */
  given: string[];
  /** When the room was closed; a closed room shows no voice bar. */
  endedAt?: string;
  /** The model_calls row of the voice's session, while one is open. */
  voiceCall?: string;
}

export interface Building {
  id: string;
  name: string;
  screens: { id: string; title: string }[];
}

export interface RoomDeps {
  /** Stores a turn of the session: who spoke and what they said. */
  turn: (speaker: string, text: string) => Promise<void>;
  /** The cards in force, oldest first. */
  cards: () => Promise<Decision[]>;
  /** The spoken yes to an open card: decided, by the speaker, superseding it. */
  yes: (cardId: string, speaker: string) => Promise<Decision>;
  /** A card decided by the speaker's yes to a question that was not a card (the brains, build it). */
  record: (card: { title: string; statement: string }, speaker: string) => Promise<Decision>;
  /** Scrap everything: every card withdrawn and kept, a named new draft started (its session). */
  scrap: (speaker: string) => Promise<{ name: string; sessionId: string }>;
  /** The product's seats, and whether the product has chosen them itself. */
  seats: () => Promise<{ seats: Partial<Seats>; chosen: boolean }>;
  /** Records the brains decided by the speaker; returns why they cannot stand, empty when they can. */
  chooseSeats: (seats: Seats, speaker: string) => Promise<string[]>;
  /** The drafter's next question, or null when none can be drafted (no key). */
  question: () => Promise<string | null>;
  /** The design explained aloud: one line per building and what it will not do. */
  /**
   * The design explained aloud: one line per building and what it will not do. `by` says whether the
   * builder drafted it, or the cards were read as decided (no builder, or a number no card holds).
   */
  narrate: () => Promise<{
    lines: { building: string | null; text: string }[];
    by: 'builder' | 'cards';
  }>;
  buildings: () => Building[];
  /** Every figure of the product, with the building it belongs to. */
  figures: () => (FigureOnHand & { building: string })[];
  /** "What if": the figure worked out again by its own function with one input changed. */
  whatIf: (figure: FigureOnHand, input: string, value: number) => Promise<string>;
}

export interface Reply {
  lines: Line[];
  /** Where to look now, when it changes. */
  go?: Place;
  /** The board is to be read (a webcam frame). */
  board?: boolean;
  /** Stage 11: a move of the camera, as the ring makes it. */
  camera?: CameraMove;
  /** Stage 11: the flow to show: a figure's name, or null for the one in front. */
  flow?: string | null;
  /** A card decided by this turn's yes. */
  decided?: Decision;
  state: RoomState;
}

const q = (s: string) => `“${s}”`;
const listed = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const BRAINS_QUESTION =
  'First, the brains. Which company builds it, which checks it, and which speaks? The rule: the checker is never the builder.';

export function startState(siteId: string, sessionId: string, people: string[]): RoomState {
  return {
    siteId,
    sessionId,
    act: 1,
    people,
    asked: null,
    place: { level: 'street' },
    history: [],
    focus: null,
    given: [],
  };
}

/** Act 1, arrive: the voice greets the people by name and says what it is. */
export function welcome(state: RoomState): Line[] {
  return [
    {
      kind: 'welcome',
      text: `Welcome, ${listed(state.people)}. I am the voice of House of Rama. I ask, I read back, and I write nothing down myself: what is decided is decided by your yes. Tell me the idea, in your own words.`,
    },
  ];
}

/** What to ask next in act 2: the brains first, then each open card, then the drafter's question. */
async function next(deps: RoomDeps): Promise<{ lines: Line[]; asked: Asked }> {
  const { chosen } = await deps.seats();
  if (!chosen)
    return {
      lines: [{ kind: 'question', text: BRAINS_QUESTION }],
      asked: { kind: 'brains-question' },
    };
  const open = (await deps.cards()).filter((d) => d.status === 'open' || d.status === 'not-built');
  const card = open[0];
  if (card)
    return {
      lines: [
        {
          kind: 'card',
          text: `The card ${q(card.title)}: ${card.statement.replace(/\s+$/, '')} Shall I write this down as decided?`,
        },
      ],
      asked: { kind: 'card', id: card.id, title: card.title },
    };
  const question = await deps.question();
  return question
    ? {
        lines: [{ kind: 'question', text: question, drafted: 'drafter' }],
        asked: { kind: 'question' },
      }
    : {
        lines: [
          {
            kind: 'ack',
            text: 'Every card is decided. When you are ready, the trainer closes ideation, and I explain the design building by building.',
          },
        ],
        asked: { kind: 'question' },
      };
}

function figureFor(
  deps: RoomDeps,
  state: RoomState,
  named: string | null,
): { figure: FigureOnHand | null; ask?: string } {
  const all = deps.figures();
  if (named) {
    const f = matchName(named, all, (f) => f.name);
    return f
      ? { figure: f }
      : { figure: null, ask: `There is no figure called ${q(named)} on this product.` };
  }
  const focused = all.find((f) => f.key === state.focus);
  if (focused) return { figure: focused };
  const here =
    state.place.level === 'building'
      ? all.filter((f) => f.building === (state.place as { building: string }).building)
      : state.place.level === 'screen'
        ? all.filter((f) => f.key.startsWith(`${(state.place as { screen: string }).screen}/`))
        : all;
  if (here.length === 1) return { figure: here[0]! };
  return {
    figure: null,
    ask: here.length
      ? `Which number? Here there are ${listed(here.map((f) => q(f.name)))}.`
      : 'There is no number in front of us. Say “show me” and a building first.',
  };
}

function go(state: RoomState, place: Place): RoomState {
  return { ...state, history: [...state.history, state.place].slice(-20), place };
}

/** One utterance by one person, in order: stored, read, answered. */
export async function hear(
  deps: RoomDeps,
  state: RoomState,
  speaker: string,
  text: string,
): Promise<Reply> {
  await deps.turn(speaker, text);
  const said = (lines: Line[], s: RoomState, extra: Partial<Reply> = {}): Reply => ({
    lines,
    ...extra,
    state: { ...s, given: [...s.given, ...lines.map((l) => l.text)] },
  });
  const cmd = parseCommand(text);
  if (state.act === 1 && cmd.kind === 'talk') state = { ...state, act: 2 };

  switch (cmd.kind) {
    case 'yes': {
      const a = state.asked;
      if (!a || a.kind === 'question' || a.kind === 'brains-question')
        return said([{ kind: 'ack', text: 'There is nothing to say yes to yet.' }], state);
      if (a.kind === 'card') {
        const d = await deps.yes(a.id, speaker);
        const n = await next(deps);
        return said(
          [{ kind: 'ack', text: `Decided by ${speaker}: ${q(a.title)}.` }, ...n.lines],
          { ...state, asked: n.asked },
          { decided: d },
        );
      }
      if (a.kind === 'brains') {
        const problems = await deps.chooseSeats(a.seats, speaker);
        if (problems.length)
          return said(
            [{ kind: 'refusal', text: `That cannot stand: ${problems[0]} ${BRAINS_QUESTION}` }],
            { ...state, asked: { kind: 'brains-question' } },
          );
        const n = await next(deps);
        return said([{ kind: 'ack', text: `Decided by ${speaker}: the brains.` }, ...n.lines], {
          ...state,
          asked: n.asked,
        });
      }
      if (a.kind === 'scrap') {
        const { name, sessionId } = await deps.scrap(speaker);
        const n = await next(deps);
        return said(
          [
            {
              kind: 'ack',
              text: `Scrapped. Every card is withdrawn and kept, and a new draft is started: ${q(name)}.`,
            },
            ...n.lines,
          ],
          { ...state, sessionId, act: 2, asked: n.asked },
        );
      }
      // a.kind === 'build': the first signature.
      const d = await deps.record(
        {
          title: 'Yes, build it',
          statement: `${speaker} said yes to the design as it was explained aloud: ${a.statement}`,
        },
        speaker,
      );
      return said(
        [
          {
            kind: 'ack',
            text: `Signed: ${speaker} said yes, build it. That is the first signature. The builder starts when the trainer presses Start build.`,
          },
        ],
        { ...state, act: 4, asked: null },
        { decided: d },
      );
    }
    case 'no': {
      const a = state.asked;
      if (a?.kind === 'card') {
        return said(
          [
            {
              kind: 'ack',
              text: `Then ${q(a.title)} stays open. Tell me what to change, and the trainer changes the card.`,
            },
          ],
          { ...state, asked: { kind: 'question' } },
        );
      }
      if (a?.kind === 'build')
        return said([{ kind: 'ack', text: 'Then nothing is built yet. Tell me what to change.' }], {
          ...state,
          act: 2,
          asked: { kind: 'question' },
        });
      if (a?.kind === 'brains')
        return said([{ kind: 'question', text: BRAINS_QUESTION }], {
          ...state,
          asked: { kind: 'brains-question' },
        });
      return said([{ kind: 'ack', text: 'Understood.' }], { ...state, asked: null });
    }
    case 'scrap':
      return said(
        [
          {
            kind: 'question',
            text: 'Scrap everything? Every card is withdrawn and kept, nothing is deleted, and a new draft starts. Say yes to scrap.',
          },
        ],
        { ...state, asked: { kind: 'scrap' } },
      );
    case 'show': {
      const b = matchName(cmd.building, deps.buildings(), (b) => b.name);
      if (!b)
        return said(
          [
            {
              kind: 'refusal',
              text: `There is no building called ${q(cmd.building)}. The buildings are ${listed(deps.buildings().map((b) => q(b.name)))}.`,
            },
          ],
          state,
        );
      const place: Place = { level: 'building', building: b.id };
      return said([{ kind: 'ack', text: `Here is ${q(b.name)}.` }], go(state, place), {
        go: place,
      });
    }
    case 'open': {
      const screens = deps
        .buildings()
        .flatMap((b) => b.screens.map((s) => ({ ...s, building: b.id })));
      const s = matchName(cmd.screen, screens, (s) => s.title);
      if (!s)
        return said(
          [
            {
              kind: 'refusal',
              text: `There is no screen called ${q(cmd.screen)}. The screens are ${listed(screens.map((s) => q(s.title)))}.`,
            },
          ],
          state,
        );
      const place: Place = { level: 'screen', screen: s.id, building: s.building };
      return said([{ kind: 'ack', text: `Here is the screen ${q(s.title)}.` }], go(state, place), {
        go: place,
      });
    }
    case 'code': {
      const building =
        state.place.level === 'building' || state.place.level === 'screen'
          ? state.place.building
          : undefined;
      const place: Place = building ? { level: 'code', building } : { level: 'code' };
      return said([{ kind: 'ack', text: 'Here is the code.' }], go(state, place), { go: place });
    }
    case 'back': {
      const place = state.history.at(-1);
      if (!place) return said([{ kind: 'ack', text: 'We are where we started.' }], state);
      return said(
        [{ kind: 'ack', text: 'Back.' }],
        { ...state, place, history: state.history.slice(0, -1) },
        { go: place },
      );
    }
    case 'flow': {
      const f = cmd.figure ? matchName(cmd.figure, deps.figures(), (x) => x.name) : null;
      if (cmd.figure && !f)
        return said(
          [
            {
              kind: 'refusal',
              text: `There is no figure called ${q(cmd.figure)} on this product.`,
            },
          ],
          state,
        );
      return said(
        [
          {
            kind: 'ack',
            text: f
              ? `Here is the flow of ${q(f.name)}, from the ground to the screen.`
              : 'Here is the flow, from the ground to the screen.',
          },
        ],
        f ? { ...state, focus: f.key } : state,
        { flow: f ? f.name : null },
      );
    }
    case 'camera': {
      const words: Record<CameraMove, string> = {
        'turn-left': 'Turning left.',
        'turn-right': 'Turning right.',
        'turn-around': 'Turning around.',
        closer: 'Closer.',
        further: 'Further.',
      };
      return said([{ kind: 'ack', text: words[cmd.move] }], state, { camera: cmd.move });
    }
    case 'board':
      return said(
        [
          {
            kind: 'ack',
            text: 'Reading the board. What it shows is a draft; nothing is decided from it.',
          },
        ],
        state,
        { board: true },
      );
    case 'track': {
      const { figure, ask } = figureFor(deps, state, cmd.figure);
      if (!figure) return said([{ kind: 'question', text: ask! }], state);
      return said([{ kind: 'track', text: answerTrack(cmd.step as TrackStep, figure) }], {
        ...state,
        focus: figure.key,
      });
    }
    case 'what-if': {
      const { figure, ask } = figureFor(deps, state, null);
      if (!figure) return said([{ kind: 'question', text: ask! }], state);
      const value = spokenNumber(cmd.value);
      if (value === null)
        return said(
          [{ kind: 'refusal', text: `I could not hear ${q(cmd.value)} as a number.` }],
          state,
        );
      return said([{ kind: 'what-if', text: await deps.whatIf(figure, cmd.input, value) }], state);
    }
    case 'talk': {
      if (state.act >= 3)
        return said(
          [
            {
              kind: 'ack',
              text: 'Noted. The trainer can reopen ideation if something must change.',
            },
          ],
          state,
        );
      const a = state.asked;
      if (a?.kind === 'brains-question' || a?.kind === 'brains') {
        const { seats } = await deps.seats();
        const heard = parseBrains(cmd.text, seats);
        if (!heard)
          return said(
            [
              {
                kind: 'question',
                text: 'I did not hear which company builds and which checks. Say, for example: Claude Code builds, OpenAI checks, OpenAI speaks.',
              },
            ],
            state,
          );
        const problems = seatProblems(heard.seats);
        const rule = problems.find((p) => p.includes('never the builder'));
        if (rule)
          return said(
            [
              {
                kind: 'refusal',
                text: `${rule.replace(/ \(Invariant 5\)/, '')} Which company checks?`,
              },
            ],
            { ...state, asked: { kind: 'brains-question' } },
          );
        if (problems.length)
          return said([{ kind: 'refusal', text: `${problems[0]} ${BRAINS_QUESTION}` }], {
            ...state,
            asked: { kind: 'brains-question' },
          });
        return said(
          [
            {
              kind: 'readback',
              text: `${brainsSpoken(heard.seats)}. The checker is never the builder. Shall I write that down?`,
            },
          ],
          { ...state, asked: { kind: 'brains', seats: heard.seats as Seats } },
        );
      }
      if (a?.kind === 'card')
        return said(
          [
            {
              kind: 'ack',
              text: `Noted. Shall I write ${q(a.title)} down as decided, or leave it open?`,
            },
          ],
          state,
        );
      const n = await next(deps);
      return said(n.lines, { ...state, asked: n.asked });
    }
  }
}

/** Act 3: the design explained aloud, building by building, then "Shall I build this?". */
export async function agree(deps: RoomDeps, state: RoomState): Promise<Reply> {
  const open = (await deps.cards()).filter((d) => d.status === 'open' || d.status === 'not-built');
  if (open.length)
    return {
      lines: [
        {
          kind: 'refusal',
          text: `Not yet: ${open.length === 1 ? 'one card is' : `${open.length} cards are`} still open, ${listed(open.map((d) => q(d.title)))}. Every card is decided before the design is explained.`,
        },
      ],
      state: { ...state, given: [...state.given] },
    };
  const { lines: narration, by } = await deps.narrate();
  const buildings = deps.buildings();
  const drafted = by === 'builder';
  const lines: Line[] = [
    {
      kind: 'narration',
      text: drafted
        ? 'Here is the design, as the builder has drafted it from your cards. None of it is decided until you say yes.'
        : 'Here is the design: your cards, as you decided them.',
    },
    ...narration.map((n): Line => {
      const b = n.building ? matchName(n.building, buildings, (b) => b.name) : null;
      return {
        kind: 'narration',
        text: n.text,
        ...(b ? { go: { level: 'building', building: b.id } } : {}),
        ...(drafted ? { drafted: 'builder' as const } : {}),
      };
    }),
  ];
  const statement = `${drafted ? '(the builder’s draft, confirmed by this yes) ' : '(the cards as decided) '}${narration.map((n) => n.text).join(' ')}`;
  lines.push({
    kind: 'ask-build',
    text: 'That is the design. Shall I build this?',
    go: { level: 'street' },
  });
  const s: RoomState = {
    ...state,
    act: 3,
    asked: { kind: 'build', statement },
    given: [...state.given, ...lines.map((l) => l.text)],
  };
  return { lines, state: s };
}
