// The idea room's routes (Stage 12), as functions of their dependencies: put files in the room, save
// the scratchpad, ask the drafter, say yes to a card it proposed, and open a file. Answers are JSON for
// the room's page, with a plain sentence when something cannot be done.
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import type { Decision } from '@rama/shared';
import {
  IdeaError,
  ProposedCard,
  type AskInput,
  type IdeaFile,
  type RoomTurn,
} from '@rama/workbench';

export interface IdeaDeps {
  addFile: (site: SiteLocation, input: { name: string; bytes: Buffer; person: string }) => IdeaFile;
  saveScratchpad: (site: SiteLocation, input: { text: string; person: string }) => boolean;
  ask: (site: SiteLocation, input: AskInput) => Promise<RoomTurn>;
  agree: (site: SiteLocation, input: { card: ProposedCard; person: Member }) => Promise<Decision>;
  /** Sends what was committed to the product's place on GitHub, when it has one; a sentence when not. */
  push: (site: SiteLocation) => Promise<string | null>;
  readFile: (site: SiteLocation, name: string) => Buffer | null;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, sentence: string) => json({ ok: false, sentence }, status);

/** A refusal the person can act on is said as it is; anything else is said plainly, without detail. */
function said(err: unknown, what: string): Response {
  if (err instanceof IdeaError) return fail(400, err.message);
  const message = (err as Error)?.message ?? String(err);
  return fail(502, `${what}: ${message}`);
}

/** POST idea/files (multipart, one or more `file`): the files go into the room. */
export async function handleUpload(
  site: SiteLocation,
  who: Member,
  form: FormData | null,
  deps: IdeaDeps,
): Promise<Response> {
  const files = (form?.getAll('file') ?? []).filter((f): f is File => typeof f !== 'string');
  if (!files.length) return fail(400, 'Choose a file to put in the room.');
  const added: IdeaFile[] = [];
  try {
    for (const f of files)
      added.push(
        deps.addFile(site, {
          name: f.name,
          bytes: Buffer.from(await f.arrayBuffer()),
          person: who.name,
        }),
      );
  } catch (err) {
    if (!added.length) return said(err, 'The file could not be kept');
    return json({ ok: true, files: added, sentence: (err as Error).message });
  }
  const pushed = await deps.push(site);
  return json({ ok: true, files: added, ...(pushed ? { sentence: pushed } : {}) });
}

/** POST idea/scratchpad {text}. */
export async function handleScratchpad(
  site: SiteLocation,
  who: Member,
  raw: unknown,
  deps: IdeaDeps,
): Promise<Response> {
  const body = z.object({ text: z.string().max(200_000) }).safeParse(raw);
  if (!body.success) return fail(400, 'expected {text}: the scratchpad as it stands');
  try {
    const changed = deps.saveScratchpad(site, { text: body.data.text, person: who.name });
    if (changed) await deps.push(site);
    return json({ ok: true, changed });
  } catch (err) {
    return said(err, 'The scratchpad could not be saved');
  }
}

/** POST idea/ask {text, files?, webSearch?}: the drafter's reply, a draft turn. */
export async function handleAsk(
  site: SiteLocation,
  who: Member,
  raw: unknown,
  deps: IdeaDeps,
): Promise<Response> {
  const body = z
    .object({
      text: z.string().min(1).max(8000),
      files: z.array(z.string().min(1).max(200)).max(12).default([]),
      webSearch: z.boolean().default(false),
    })
    .safeParse(raw);
  if (!body.success) return fail(400, 'expected {text, files?, webSearch?}: one message');
  try {
    const turn = await deps.ask(site, { person: who, ...body.data });
    return json({ ok: true, turn });
  } catch (err) {
    return said(err, 'The drafter could not answer');
  }
}

/** POST idea/agree {title, statement}: the person's yes to a proposed card. */
export async function handleAgree(
  site: SiteLocation,
  who: Member,
  raw: unknown,
  deps: IdeaDeps,
): Promise<Response> {
  const card = ProposedCard.safeParse(raw);
  if (!card.success) return fail(400, 'expected {title, statement}: the card said yes to');
  try {
    const decision = await deps.agree(site, { card: card.data, person: who });
    return json({
      ok: true,
      decision: { id: decision.id, title: decision.title, by: decision.by },
      sentence: `“${decision.title}” is decided, by ${decision.by}.`,
    });
  } catch (err) {
    return said(err, 'The card could not be written');
  }
}

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  json: 'text/plain; charset=utf-8',
};

/** GET idea/files/<name>: the file, shown in the browser when it can be, saved otherwise. */
export function handleFile(site: SiteLocation, name: string, deps: IdeaDeps): Response {
  const bytes = deps.readFile(site, name);
  if (!bytes) return fail(404, `${name} is not in the room.`);
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES[ext];
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': type ?? 'application/octet-stream',
      'content-disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      // A file people put in the room is never run as a page of this app.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}
