// The board (Stage 10, minimal): a frame from the laptop's webcam, taken when someone asks ("read the
// board"), read by packages/model (prompt board.v1, the drafter seat) into boxes, arrows and labels.
// The frame and its reading are kept under work/<site>/board/ and shown as a draft map. Nothing is
// decided from it: no card, no building, no figure is written from a reading.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { workDir } from '@rama/blueprint/site';
import { call, type CallDeps, type Image } from '@rama/model';

export const BOARD_COMPONENT = 'rama:board@0.1.0';
/** A frame larger than this is refused before any model sees it. */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024;

export const BoardReading = z.object({
  boxes: z.array(z.object({ id: z.string().min(1).max(20), label: z.string().max(200) })).max(80),
  arrows: z
    .array(
      z.object({
        from: z.string().min(1).max(20),
        to: z.string().min(1).max(20),
        label: z.string().max(200).default(''),
      }),
    )
    .max(160),
  labels: z.array(z.string().max(200)).max(80),
});
export type BoardReading = z.infer<typeof BoardReading>;

export interface BoardDraft {
  /** When the frame was taken, ISO 8601; also the draft's name. */
  at: string;
  /** Who asked for the board to be read. */
  by: string;
  /** The frame's file, under work/<site>/board/. */
  frame: string;
  reading: BoardReading;
  /** Arrows that point at a box the reading does not have: shown, and said to be loose. */
  loose: number;
  vendor: string;
  model: string;
  callId: string;
  /** Always true: a reading is a draft for people to look at. */
  draft: true;
}

const boardDir = (siteId: string, env: NodeJS.ProcessEnv) =>
  path.join(workDir(env), siteId, 'board');

/** Reads one frame of the board into a draft map, and keeps both. */
export async function readBoard(
  input: { siteId: string; product: string; image: Image; by: string; createdBy: string },
  opts: {
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    call?: typeof call;
    model?: Partial<CallDeps>;
  } = {},
): Promise<BoardDraft> {
  const env = opts.env ?? process.env;
  const bytes = Buffer.from(input.image.base64, 'base64');
  if (!bytes.length) throw new Error('the frame is empty: the camera gave no picture');
  if (bytes.length > MAX_FRAME_BYTES)
    throw new Error(
      `the frame is ${Math.round(bytes.length / 1024)} KB; at most ${MAX_FRAME_BYTES / 1024 / 1024} MB is read`,
    );
  const at = (opts.now ?? (() => new Date()))().toISOString();
  const res = await (opts.call ?? call)(
    {
      name: 'board',
      version: 1,
      // The row keeps what was read, not the picture: its size and fingerprint; the frame is on disk.
      input: { product: input.product },
      images: [input.image],
      output: BoardReading,
      role: 'drafter',
      siteId: input.siteId,
      createdBy: input.createdBy,
      maxTokens: 4000,
    },
    opts.model ?? { env },
  );
  const reading = res.output;
  const ids = new Set(reading.boxes.map((b) => b.id));
  const dir = boardDir(input.siteId, env);
  mkdirSync(dir, { recursive: true });
  const stamp = at.replace(/[:.]/g, '-');
  const ext = input.image.mediaType.split('/')[1]!.replace('jpeg', 'jpg');
  const frame = `${stamp}.${ext}`;
  writeFileSync(path.join(dir, frame), bytes);
  const draft: BoardDraft = {
    at,
    by: input.by,
    frame,
    reading,
    loose: reading.arrows.filter((a) => !ids.has(a.from) || !ids.has(a.to)).length,
    vendor: res.vendor,
    model: res.model,
    callId: res.callId,
    draft: true,
  };
  writeFileSync(
    path.join(dir, `${stamp}.json`),
    `${JSON.stringify({ ...draft, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2)}\n`,
  );
  return draft;
}

/** The site's board readings, newest first. */
export function listBoards(siteId: string, env: NodeJS.ProcessEnv = process.env): BoardDraft[] {
  const dir = boardDir(siteId, env);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as BoardDraft);
}

/** A kept frame's bytes, by its file name; null for any name that is not one. */
export function boardFrame(
  siteId: string,
  frame: string,
  env: NodeJS.ProcessEnv = process.env,
): Buffer | null {
  if (!/^[0-9TZ-]+\.(jpg|png|webp)$/.test(frame)) return null;
  const f = path.join(boardDir(siteId, env), frame);
  return existsSync(f) ? readFileSync(f) : null;
}
