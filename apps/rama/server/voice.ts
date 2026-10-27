// The voice routes' deps on the real records (Stage 10), and whether the room can have the real voice.
import { readMembers, secretFor, type Member } from '@rama/db';
import { startSession, addTurn } from '@rama/ceremony';
import { agree, EARS_COMPONENT, hear, linesToSay, readRoom, roomDeps, writeRoom } from '@rama/ears';
import { readBoard } from '@rama/board';
import { openVoice, recordVoiceLine, vendorEntry } from '@rama/model';
import { seatsOf } from '@rama/workbench';
import { flowOf, readCapture } from '@rama/trace';
import type { VoiceDeps } from '../app/api/site/[siteId]/voice/handler';
import { jobDb } from './jobs';

export function voiceDeps(): VoiceDeps {
  return {
    room: (siteId) => readRoom(siteId),
    save: (state) => writeRoom(state),
    members: () => readMembers().map((m) => m.name),
    startSession: (site, title, who) =>
      jobDb((db) => startSession(db, site.id, { title, createdBy: who.id })),
    hear: (site, state, speaker, text) =>
      jobDb((db) => {
        let s = state;
        return hear(
          roomDeps(db, site, () => s),
          s,
          speaker,
          text,
        ).then((r) => ((s = r.state), r));
      }),
    agree: (site, state) =>
      jobDb((db) =>
        agree(
          roomDeps(db, site, () => state),
          state,
        ),
      ),
    turn: (site, sessionId, speaker, text) =>
      jobDb((db) =>
        addTurn(db, site.id, sessionId, {
          speaker,
          text,
          at: new Date(),
          createdBy: EARS_COMPONENT,
        }),
      ),
    events: (lines) => linesToSay(lines),
    open: async (site, who, sdp) => {
      const seat = (await jobDb((db) => seatsOf(db, site.id))).seats.voice;
      if (!seat) throw new Error('no one is chosen for the voice seat');
      return openVoice({ siteId: site.id, createdBy: who.id, seat, sdp });
    },
    line: async (site, who, read) => {
      const seat = (await jobDb((db) => seatsOf(db, site.id))).seats.voice;
      await recordVoiceLine({
        siteId: site.id,
        createdBy: who.id,
        model: seat?.model ?? 'unknown',
        ...read,
      });
    },
    board: (site, who, image) =>
      readBoard({ siteId: site.id, product: site.name, image, by: who.name, createdBy: who.id }),
    now: () => new Date(),
    flowStep: (site, key, step) => {
      const capture = readCapture(site.id);
      return (capture && flowOf(capture, key)?.steps[step]?.sentence) || null;
    },
  };
}

export type VoiceMode = { mode: 'live'; label: string } | { mode: 'stand-in'; why: string };

/**
 * Whether the room has the real voice: the voice seat's vendor speaks, its key is in Settings, and the
 * server is not told to use the stand-in (RAMA_VOICE=stand-in, for tests and rehearsals without a key).
 */
export async function voiceMode(
  siteId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VoiceMode> {
  if (env.RAMA_VOICE === 'stand-in')
    return { mode: 'stand-in', why: 'this server is set to use the stand-in voice' };
  try {
    const seat = (await jobDb((db) => seatsOf(db, siteId, env))).seats.voice;
    const v = seat ? vendorEntry(seat.vendor) : undefined;
    if (!seat || !v || !v.seats.includes('voice'))
      return { mode: 'stand-in', why: 'no company that speaks holds the voice seat' };
    if (v.key && !(await secretFor(v.key, env)))
      return { mode: 'stand-in', why: `the ${v.label} key is not in Settings` };
    return { mode: 'live', label: `${v.label} (${seat.model})` };
  } catch (err) {
    return { mode: 'stand-in', why: (err as Error).message };
  }
}

export type { Member };
