// The voice in the room (Stage 10), its routes. The page holds the voice's audio (WebRTC with OpenAI's
// Realtime API, or the stand-in); everything else happens here. What a person says comes in with their
// name and goes to the conductor; what comes back is builder lines, each with the event that makes the
// voice read it, and where to look. What the voice actually said comes back too, and is checked against
// the lines it was given (the mouth, not the mind) before it is kept as a turn.
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import {
  ideaWelcome,
  mouthCheck,
  spoken,
  startState,
  welcome,
  type Line,
  type Place,
  type Reply,
  type RoomState,
} from '@rama/ears';
import type { BoardDraft } from '@rama/board';
import type { RoomTurn } from '@rama/workbench';
import { placeHref } from '../../../../../components/lakefront/places';

export interface VoiceDeps {
  room: (siteId: string) => RoomState | null;
  save: (state: RoomState) => void;
  /** Names in members.json. */
  members: () => string[];
  startSession: (site: SiteLocation, title: string, who: Member) => Promise<string>;
  hear: (site: SiteLocation, state: RoomState, speaker: string, text: string) => Promise<Reply>;
  agree: (site: SiteLocation, state: RoomState) => Promise<Reply>;
  /** Stores a turn of the session (the voice's own, as "Rama"). */
  turn: (site: SiteLocation, sessionId: string, speaker: string, text: string) => Promise<void>;
  /** Each line with the data-channel event that makes the voice read it. */
  events: (lines: Line[]) => Promise<(Line & { event: unknown })[]>;
  open: (site: SiteLocation, who: Member, sdp: string) => Promise<{ sdp: string; callId: string }>;
  /** One line the live voice read: its own model_calls row, with the vendor's count of its tokens. */
  line: (
    site: SiteLocation,
    who: Member,
    read: {
      line: string;
      said: string;
      inputTokens: number | null;
      outputTokens: number | null;
      ms: number;
    },
  ) => Promise<void>;
  board: (
    site: SiteLocation,
    who: Member,
    image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string },
  ) => Promise<BoardDraft>;
  now: () => Date;
  /**
   * What a person said in the idea room (Stage 12), asked of the drafter as a typed message is: the
   * drafter's reply, kept as a draft turn of the room.
   */
  ideaAsk: (
    site: SiteLocation,
    input: { speaker: string; text: string; files: string[]; webSearch: boolean },
  ) => Promise<RoomTurn>;
  /** A step of a figure's flow, as House of Rama derived it (packages/trace flowOf); null when none. */
  flowStep: (site: SiteLocation, figureKey: string, step: number) => string | null;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, sentence: string) => json({ ok: false, sentence }, status);

/** The address of a place in the room: the lakefront's levels, or a screen in the Showroom. */
export function placeUrl(siteId: string, place: Place): string {
  if (place.level === 'screen')
    return `/site/${encodeURIComponent(siteId)}/showroom?screen=${encodeURIComponent(place.screen)}`;
  if (place.level === 'building')
    return placeHref(siteId, { level: 'building', building: place.building });
  if (place.level === 'code')
    return placeHref(siteId, { level: 'code', building: place.building ?? null });
  if (place.level === 'ground') return placeHref(siteId, { level: 'ground', table: place.table });
  return placeHref(siteId, { level: 'street' });
}

const openRoom = (deps: VoiceDeps, siteId: string) => {
  const r = deps.room(siteId);
  return r && !r.endedAt ? r : null;
};

async function answer(
  site: SiteLocation,
  deps: VoiceDeps,
  reply: Reply,
  extra: Record<string, unknown> = {},
) {
  deps.save(reply.state);
  return json({
    ok: true,
    act: reply.state.act,
    // Each line's place as an address, so the room moves as the line is read.
    lines: (await deps.events(reply.lines)).map(({ go, ...l }) => ({
      ...l,
      go: go ? placeUrl(site.id, go) : null,
    })),
    go: reply.go ? placeUrl(site.id, reply.go) : null,
    board: Boolean(reply.board),
    camera: reply.camera ?? null,
    flow: reply.flow === undefined ? undefined : reply.flow,
    decided: reply.decided ? { title: reply.decided.title, by: reply.decided.by } : null,
    ...extra,
  });
}

/** POST voice/start {people}: opens the room, act 1. */
export async function handleStart(site: SiteLocation, who: Member, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({
      people: z.array(z.string().min(1).max(80)).min(1).max(8),
      /** The session is held in the idea room (Stage 12). */
      idea: z.boolean().default(false),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'Choose who is in the room.');
  const known = new Set(deps.members());
  const strangers = body.data.people.filter((p) => !known.has(p));
  if (strangers.length) return fail(400, `${strangers.join(', ')} is not in members.json.`);
  const sessionId = await deps.startSession(
    site,
    `Session with the voice, ${deps.now().toISOString().slice(0, 10)}`,
    who,
  );
  const opened = startState(site.id, sessionId, [...new Set(body.data.people)]);
  const state = body.data.idea ? { ...opened, idea: true } : opened;
  const lines = body.data.idea ? ideaWelcome(state) : welcome(state);
  return answer(site, deps, { lines, state: { ...state, given: lines.map((l) => l.text) } });
}

/** POST voice/heard {speaker, text, focus?}: one utterance by one person. */
export async function handleHeard(site: SiteLocation, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({
      speaker: z.string().min(1).max(80),
      text: z.string().trim().min(1).max(2000),
      focus: z.string().max(200).nullish(),
      /** In the idea room: the room's files sent with what was said, and whether to search the web. */
      files: z.array(z.string().min(1).max(200)).max(12).default([]),
      webSearch: z.boolean().default(false),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {speaker, text}');
  const state = openRoom(deps, site.id);
  if (!state) return fail(409, 'The room is not open: start a session with the voice first.');
  if (!state.people.includes(body.data.speaker))
    return fail(400, `${body.data.speaker} is not in the room.`);
  if (state.idea) return ideaHeard(site, state, body.data, deps);
  const s = body.data.focus ? { ...state, focus: body.data.focus } : state;
  try {
    return await answer(site, deps, await deps.hear(site, s, body.data.speaker, body.data.text));
  } catch (err) {
    return fail(409, (err as Error).message);
  }
}

/**
 * In the idea room the drafter answers what was said, and its reply is the line the voice reads (the
 * drafter's draft, marked as one); a card it proposes is said by title, to be decided on the screen.
 */
async function ideaHeard(
  site: SiteLocation,
  state: RoomState,
  said: { speaker: string; text: string; files: string[]; webSearch: boolean },
  deps: VoiceDeps,
) {
  let turn: RoomTurn;
  try {
    turn = await deps.ideaAsk(site, said);
  } catch (err) {
    return fail(502, `The drafter could not answer: ${(err as Error).message}`);
  }
  const lines: Line[] = [{ kind: 'idea', text: spoken(turn.text), drafted: 'drafter' }];
  const cards = turn.meta?.cards ?? [];
  if (cards.length)
    lines.push({
      kind: 'idea',
      text: `The drafter proposes ${cards.length === 1 ? 'a card' : `${cards.length} cards`}: ${cards.map((c) => c.title).join('; ')}. Say yes to ${cards.length === 1 ? 'it' : 'each'} on the screen to write ${cards.length === 1 ? 'it' : 'them'} down.`,
    });
  return answer(
    site,
    deps,
    { lines, state: { ...state, given: [...state.given, ...lines.map((l) => l.text)] } },
    { idea: { speaker: said.speaker, text: said.text, files: said.files, turn } },
  );
}

/**
 * POST voice/said {text, line?, usage?}: what the voice actually said, checked against the lines it was
 * given, kept as Rama's turn. From the live voice it also names the line it was reading and what the
 * vendor counted for it: that line's own model_calls row.
 */
export async function handleSaid(site: SiteLocation, who: Member, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({
      text: z.string().trim().min(1).max(4000),
      line: z.string().max(4000).optional(),
      usage: z
        .object({
          inputTokens: z.number().int().min(0),
          outputTokens: z.number().int().min(0),
          ms: z.number().int().min(0),
        })
        .optional(),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {text, line?, usage?}');
  const state = openRoom(deps, site.id);
  if (!state) return fail(409, 'The room is not open.');
  if (body.data.usage) {
    if (!state.voiceCall) return fail(409, 'No live voice is recorded for this room.');
    await deps.line(site, who, {
      line: body.data.line ?? '',
      said: body.data.text,
      inputTokens: body.data.usage.inputTokens,
      outputTokens: body.data.usage.outputTokens,
      ms: body.data.usage.ms,
    });
  }
  const check = mouthCheck(body.data.text, state.given);
  await deps.turn(site, state.sessionId, 'Rama', body.data.text);
  if (!check.ok)
    await deps.turn(
      site,
      state.sessionId,
      'House of Rama',
      `The voice said ${check.unsupported.join(', ')}, which no line handed to it holds. It is not part of the record; the builder's lines are.`,
    );
  return json({ ok: true, mouth: check });
}

/** POST voice/agree: act 3, the design explained aloud, then "Shall I build this?". */
export async function handleAgree(site: SiteLocation, deps: VoiceDeps) {
  const state = openRoom(deps, site.id);
  if (!state) return fail(409, 'The room is not open: start a session with the voice first.');
  return answer(site, deps, await deps.agree(site, state));
}

/** POST voice/session (body: the SDP offer): the voice's audio, through packages/model. */
export async function handleSession(site: SiteLocation, who: Member, sdp: string, deps: VoiceDeps) {
  const state = openRoom(deps, site.id);
  if (!state) return fail(409, 'The room is not open.');
  if (!sdp.startsWith('v=')) return fail(400, 'expected an SDP offer');
  try {
    const { sdp: answerSdp, callId } = await deps.open(site, who, sdp);
    deps.save({ ...state, voiceCall: callId });
    return new Response(answerSdp, {
      headers: { 'content-type': 'application/sdp', 'x-rama-call': callId },
    });
  } catch (err) {
    return fail(502, `The voice could not start: ${(err as Error).message}`);
  }
}

/** POST voice/end: closes the room. Its turns and cards stay. */
export async function handleEnd(site: SiteLocation, deps: VoiceDeps) {
  const state = openRoom(deps, site.id);
  if (!state) return json({ ok: true });
  deps.save({ ...state, endedAt: deps.now().toISOString() });
  return json({ ok: true });
}

/** POST board {mediaType, base64}: one frame of the board, read into a draft map. */
export async function handleBoard(site: SiteLocation, who: Member, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      base64: z.string().min(1).max(6_000_000),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {mediaType, base64}: one frame from the camera');
  try {
    const d = await deps.board(site, who, body.data);
    return json({ ok: true, board: d });
  } catch (err) {
    return fail(502, `The board could not be read: ${(err as Error).message}`);
  }
}

/**
 * POST voice/tell {text}: builder text for the voice to read that no one asked for by voice: a step of
 * a figure's flow as the water reaches it (Stage 11). It is a builder line like any other, so the mouth
 * check counts it.
 */
export async function handleTell(site: SiteLocation, raw: unknown, deps: VoiceDeps) {
  // The page names the step; the sentence comes from the flow House of Rama derived (reviewer run 1):
  // text the page wrote would let anyone hand the voice a fact of their own as a builder line.
  const body = z
    .object({ figure: z.string().min(1).max(200), step: z.number().int().min(0).max(50) })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {figure, step}');
  const state = openRoom(deps, site.id);
  if (!state) return json({ ok: true, lines: [] });
  const text = deps.flowStep(site, body.data.figure, body.data.step);
  if (!text) return fail(404, 'There is no such step of that figure’s flow.');
  const lines: Line[] = [{ kind: 'track', text }];
  return answer(site, deps, { lines, state: { ...state, given: [...state.given, text] } });
}
