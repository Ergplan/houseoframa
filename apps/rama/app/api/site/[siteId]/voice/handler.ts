// The voice in the room (Stage 10), its routes. The page holds the voice's audio (WebRTC with OpenAI's
// Realtime API, or the stand-in); everything else happens here. What a person says comes in with their
// name and goes to the conductor; what comes back is builder lines, each with the event that makes the
// voice read it, and where to look. What the voice actually said comes back too, and is checked against
// the lines it was given (the mouth, not the mind) before it is kept as a turn.
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import {
  mouthCheck,
  startState,
  welcome,
  type Line,
  type Place,
  type Reply,
  type RoomState,
} from '@rama/ears';
import type { BoardDraft } from '@rama/board';
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
    decided: reply.decided ? { title: reply.decided.title, by: reply.decided.by } : null,
    ...extra,
  });
}

/** POST voice/start {people}: opens the room, act 1. */
export async function handleStart(site: SiteLocation, who: Member, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({ people: z.array(z.string().min(1).max(80)).min(1).max(8) })
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
  const state = startState(site.id, sessionId, [...new Set(body.data.people)]);
  const lines = welcome(state);
  return answer(site, deps, { lines, state: { ...state, given: lines.map((l) => l.text) } });
}

/** POST voice/heard {speaker, text, focus?}: one utterance by one person. */
export async function handleHeard(site: SiteLocation, raw: unknown, deps: VoiceDeps) {
  const body = z
    .object({
      speaker: z.string().min(1).max(80),
      text: z.string().trim().min(1).max(2000),
      focus: z.string().max(200).nullish(),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {speaker, text}');
  const state = openRoom(deps, site.id);
  if (!state) return fail(409, 'The room is not open: start a session with the voice first.');
  if (!state.people.includes(body.data.speaker))
    return fail(400, `${body.data.speaker} is not in the room.`);
  const s = body.data.focus ? { ...state, focus: body.data.focus } : state;
  try {
    return await answer(site, deps, await deps.hear(site, s, body.data.speaker, body.data.text));
  } catch (err) {
    return fail(409, (err as Error).message);
  }
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
