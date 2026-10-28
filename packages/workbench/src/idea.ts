// The idea room (Stage 12): where a product's idea is talked through before anything is built, like a
// brainstorming room in an office. People write or talk; the drafter answers, reads the files they put
// in the room and searches the web when asked; the room keeps a scratchpad. Everything the drafter says
// is a draft (Invariant 6): its replies are marked unconfirmed, the pages its search read are the
// vendor's own list, and a card it proposes becomes a decision only on a named person's yes.
//
// Files and the scratchpad live in the product's own repository, under idea/, committed in the name of
// the person who put them there, so they travel with the product and the builder reads them.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { siteRecord, type SiteLocation } from '@rama/blueprint/site';
import {
  addTurn,
  currentDecisions,
  decide,
  listDecisions,
  listSessions,
  startSession,
} from '@rama/ceremony';
import type { Db, Member, TurnMeta } from '@rama/db';
import { call as modelCall, type Document, type Image } from '@rama/model';
import type { Decision } from '@rama/shared';
import { jobStatus, latestJob } from './jobs.ts';

export const IDEA_COMPONENT = 'rama:workbench-idea@0.1.0';
export const IDEA_FILES = 'idea/files';
export const SCRATCHPAD = 'idea/scratchpad.md';
/** The idea room's conversation is a discovery session of this title. */
export const IDEA_SESSION = 'Idea room';
/** The drafter is the drafter seat's model; it is never the voice (Invariant 9). */
export const DRAFTER_SPEAKER = 'Drafter';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** What one message may send the drafter, files and pictures together. */
const MAX_SENT_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_CHARS = 300_000;
const HISTORY = 40;

export type FileKind = 'pdf' | 'image' | 'text' | 'other';

export interface IdeaFile {
  name: string;
  bytes: number;
  kind: FileKind;
  addedBy: string | null;
  addedAt: string | null;
}

const IMAGE_TYPES: Record<string, Image['mediaType']> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
]);

/** What kind of file a name is, by its ending: what the drafter can be sent. */
export function fileKind(name: string): FileKind {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext in IMAGE_TYPES) return 'image';
  if (TEXT_EXT.has(ext)) return 'text';
  return 'other';
}

/** A file's name as kept: its last part only, plain letters, no leading dot; null when nothing is left. */
export function safeFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base
    .normalize('NFKC')
    .replace(/[^\w.\- ()]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+/, '')
    .trim()
    .slice(0, 120);
  return clean && !/^\.+$/.test(clean) ? clean : null;
}

export class IdeaError extends Error {
  override name = 'IdeaError';
}

const git = (repoDir: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('git', ['-C', repoDir, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Commits only the given paths, as the person, by House of Rama; nothing else in the checkout. */
function commitPaths(repoDir: string, paths: string[], message: string, person: string, at: Date) {
  git(repoDir, ['add', '--', ...paths]);
  if (!git(repoDir, ['diff', '--cached', '--name-only', '--', ...paths]).trim()) return false;
  git(repoDir, ['commit', '--quiet', '-m', message, '--', ...paths], {
    ...process.env,
    GIT_AUTHOR_NAME: person,
    GIT_AUTHOR_EMAIL: 'people@houseoframa.local',
    GIT_COMMITTER_NAME: 'House of Rama',
    GIT_COMMITTER_EMAIL: 'rama@houseoframa.local',
    GIT_AUTHOR_DATE: at.toISOString(),
    GIT_COMMITTER_DATE: at.toISOString(),
  });
  return true;
}

/** The builder works in the same checkout: nothing is put into it while a lift is in hand. */
export function building(site: SiteLocation, env: NodeJS.ProcessEnv = process.env): boolean {
  const job = latestJob('build', site.id, env);
  return Boolean(job && jobStatus(job) === 'running');
}

function refuseWhileBuilding(site: SiteLocation, env: NodeJS.ProcessEnv) {
  if (building(site, env))
    throw new IdeaError(
      'The builder is at work in the product just now; put this in the room when the lift is done.',
    );
}

/** Who last wrote a path and when, from the product's history. */
function lastWrite(repoDir: string, rel: string): { by: string | null; at: string | null } {
  try {
    const out = git(repoDir, ['log', '-1', '--format=%an|%aI', '--', rel]).trim();
    if (!out) return { by: null, at: null };
    const [by, at] = out.split('|');
    return { by: by ?? null, at: at ?? null };
  } catch {
    return { by: null, at: null };
  }
}

/** The files in the room, newest first. */
export function listIdeaFiles(site: SiteLocation): IdeaFile[] {
  const dir = path.join(site.repoDir, IDEA_FILES);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const rel = `${IDEA_FILES}/${e.name}`;
      const w = lastWrite(site.repoDir, rel);
      return {
        name: e.name,
        bytes: statSync(path.join(dir, e.name)).size,
        kind: fileKind(e.name),
        addedBy: w.by,
        addedAt: w.at,
      };
    })
    .sort(
      (a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.name.localeCompare(b.name),
    );
}

/** A file of the room, by its kept name; null when there is none. */
export function readIdeaFile(site: SiteLocation, name: string): Buffer | null {
  const safe = safeFileName(name);
  if (!safe || safe !== name) return null;
  const f = path.join(site.repoDir, IDEA_FILES, safe);
  return existsSync(f) && statSync(f).isFile() ? readFileSync(f) : null;
}

/** Puts a file in the room: kept under idea/files (a second of the same name is numbered), committed. */
export function addIdeaFile(
  site: SiteLocation,
  input: { name: string; bytes: Buffer; person: string; now?: Date; env?: NodeJS.ProcessEnv },
): IdeaFile {
  const env = input.env ?? process.env;
  refuseWhileBuilding(site, env);
  const name = safeFileName(input.name);
  if (!name) throw new IdeaError('The file needs a name.');
  if (!input.bytes.length) throw new IdeaError(`${name} is empty.`);
  if (input.bytes.length > MAX_FILE_BYTES)
    throw new IdeaError(
      `${name} is larger than 20 MB; put in a smaller copy or the pages that matter.`,
    );
  const dir = path.join(site.repoDir, IDEA_FILES);
  mkdirSync(dir, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let kept = name;
  for (let n = 2; existsSync(path.join(dir, kept)); n++) kept = `${stem}-${n}${ext}`;
  writeFileSync(path.join(dir, kept), input.bytes);
  const at = input.now ?? new Date();
  commitPaths(site.repoDir, [`${IDEA_FILES}/${kept}`], `Idea: add ${kept}`, input.person, at);
  return {
    name: kept,
    bytes: input.bytes.length,
    kind: fileKind(kept),
    addedBy: input.person,
    addedAt: at.toISOString(),
  };
}

export interface Scratchpad {
  text: string;
  savedBy: string | null;
  savedAt: string | null;
}

export function readScratchpad(site: SiteLocation): Scratchpad {
  const f = path.join(site.repoDir, SCRATCHPAD);
  if (!existsSync(f)) return { text: '', savedBy: null, savedAt: null };
  const w = lastWrite(site.repoDir, SCRATCHPAD);
  return { text: readFileSync(f, 'utf8'), savedBy: w.by, savedAt: w.at };
}

/** Saves the room's scratchpad as the person; false when nothing changed. */
export function saveScratchpad(
  site: SiteLocation,
  input: { text: string; person: string; now?: Date; env?: NodeJS.ProcessEnv },
): boolean {
  refuseWhileBuilding(site, input.env ?? process.env);
  if (input.text.length > 200_000)
    throw new IdeaError('The scratchpad holds up to 200,000 letters.');
  const f = path.join(site.repoDir, SCRATCHPAD);
  const text = input.text.replace(/\r\n/g, '\n');
  if ((existsSync(f) ? readFileSync(f, 'utf8') : '') === text) return false;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
  return commitPaths(
    site.repoDir,
    [SCRATCHPAD],
    'Idea: the scratchpad',
    input.person,
    input.now ?? new Date(),
  );
}

/** A card the drafter proposes: unconfirmed until a person says yes to it. */
export const ProposedCard = z.object({
  title: z.string().trim().min(1).max(120),
  statement: z.string().trim().min(1).max(2000),
});
export type ProposedCard = z.infer<typeof ProposedCard>;

/**
 * The drafter's reply split into its words and the cards it proposes: the last ```cards block, a JSON
 * list of {title, statement}. A block that is not that list is dropped and proposes nothing.
 */
export function splitCards(text: string): { reply: string; cards: ProposedCard[] } {
  const re = /```cards\s*\n([\s\S]*?)```/g;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) last = m;
  const reply = text.replace(re, '').trim();
  if (!last) return { reply, cards: [] };
  try {
    const parsed = z.array(ProposedCard).max(8).safeParse(JSON.parse(last[1]!));
    return { reply, cards: parsed.success ? parsed.data : [] };
  } catch {
    return { reply, cards: [] };
  }
}

export interface RoomTurn {
  id: string;
  speaker: string;
  text: string;
  draft: boolean;
  at: string;
  meta?: TurnMeta;
}

/** The idea room's conversation, oldest first: every turn of its sessions. */
export async function roomTurns(
  db: Db,
  siteId: string,
): Promise<{ sessionId: string | null; turns: RoomTurn[] }> {
  const sessions = (await listSessions(db, siteId)).filter((s) => s.title === IDEA_SESSION);
  return {
    sessionId: sessions.at(-1)?.id ?? null,
    turns: sessions.flatMap((s) =>
      s.turns.map((t) => ({
        id: t.id,
        speaker: t.speaker,
        text: t.text,
        draft: t.draft,
        at: t.at,
        ...(t.meta ? { meta: t.meta } : {}),
      })),
    ),
  };
}

async function roomSession(db: Db, siteId: string, person: Member): Promise<string> {
  const { sessionId } = await roomTurns(db, siteId);
  return sessionId ?? startSession(db, siteId, { title: IDEA_SESSION, createdBy: person.id });
}

/** The files of a message as the drafter is sent them; one it cannot read is named, not sent. */
function filesForDrafter(site: SiteLocation, names: string[]) {
  const documents: Document[] = [];
  const images: Image[] = [];
  const unread: string[] = [];
  let sent = 0;
  for (const name of names) {
    const bytes = readIdeaFile(site, name);
    if (!bytes) throw new IdeaError(`${name} is not in the room.`);
    const kind = fileKind(name);
    if (kind === 'other' || sent + bytes.length > MAX_SENT_BYTES) {
      unread.push(name);
      continue;
    }
    sent += bytes.length;
    if (kind === 'pdf') documents.push({ kind: 'pdf', name, base64: bytes.toString('base64') });
    else if (kind === 'image')
      images.push({
        mediaType: IMAGE_TYPES[path.extname(name).toLowerCase()]!,
        base64: bytes.toString('base64'),
      });
    else
      documents.push({ kind: 'text', name, text: bytes.toString('utf8').slice(0, MAX_TEXT_CHARS) });
  }
  return { documents, images, unread };
}

export interface AskInput {
  person: Member;
  text: string;
  /** Room files sent with this message, by name. */
  files: string[];
  webSearch: boolean;
}

export interface AskDeps {
  call?: typeof modelCall;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

/**
 * One message to the drafter: the person's turn is kept with the files it carried, the drafter is
 * asked through packages/model (prompt idea.v1, the drafter seat) with the room as it stands, and its
 * reply is kept as a draft turn with the pages its search read and the cards it proposed.
 */
export async function askDrafter(
  db: Db,
  site: SiteLocation,
  input: AskInput,
  deps: AskDeps = {},
): Promise<RoomTurn> {
  const text = input.text.trim();
  if (!text) throw new IdeaError('Write something first.');
  if (text.length > 8000) throw new IdeaError('Keep one message under 8,000 letters.');
  const now = deps.now ?? (() => new Date());
  const env = deps.env ?? process.env;
  const files = [...new Set(input.files)];
  const sending = filesForDrafter(site, files);
  const sessionId = await roomSession(db, site.id, input.person);
  const history = (await roomTurns(db, site.id)).turns.slice(-HISTORY);
  await addTurn(db, site.id, sessionId, {
    speaker: input.person.name,
    text,
    ...(files.length ? { meta: { files } } : {}),
    at: now(),
    createdBy: input.person.id,
  });
  const cards: Decision[] = currentDecisions(await listDecisions(db, site.id));
  const record = siteRecord(site.id, env);
  const res = await (deps.call ?? modelCall)({
    name: 'idea',
    version: 1,
    input: {
      product: { name: site.name, idea: record?.idea ?? null },
      cards: cards.map((d) => ({ title: d.title, statement: d.statement, status: d.status })),
      scratchpad: readScratchpad(site).text.slice(0, 20_000),
      roomFiles: listIdeaFiles(site).map((f) => f.name),
      attached: files.filter((f) => !sending.unread.includes(f)),
      notReadable: sending.unread,
      webSearch: input.webSearch,
      conversation: history.map((t) => ({ speaker: t.speaker, text: t.text })),
      message: { speaker: input.person.name, text },
    },
    output: z.string().min(1),
    format: 'text',
    role: 'drafter',
    siteId: site.id,
    createdBy: input.person.id,
    maxTokens: 8000,
    ...(sending.documents.length ? { documents: sending.documents } : {}),
    ...(sending.images.length ? { images: sending.images } : {}),
    ...(input.webSearch ? { webSearch: true } : {}),
  });
  const { reply, cards: proposed } = splitCards(res.output);
  const meta: TurnMeta = {
    callId: res.callId,
    ...(res.sources?.length ? { sources: res.sources } : {}),
    ...(proposed.length ? { cards: proposed } : {}),
  };
  const at = now();
  await addTurn(db, site.id, sessionId, {
    speaker: DRAFTER_SPEAKER,
    text: reply || 'The drafter proposed cards and said nothing else.',
    draft: true,
    meta,
    at,
    createdBy: `${IDEA_COMPONENT}`,
  });
  const turns = (await roomTurns(db, site.id)).turns;
  return turns.at(-1)!;
}

/** A proposed card said yes to: a decided card in the person's name, in the room's session. */
export async function agreeCard(
  db: Db,
  site: SiteLocation,
  input: { card: ProposedCard; person: Member; now?: Date },
): Promise<Decision> {
  const card = ProposedCard.parse(input.card);
  const sessionId = await roomSession(db, site.id, input.person);
  return decide(
    db,
    { id: site.id, repoDir: site.repoDir },
    {
      title: card.title,
      statement: card.statement,
      bricks: [],
      status: 'decided',
      by: input.person.name,
      at: input.now ?? new Date(),
      sessionId,
      createdBy: input.person.id,
    },
  );
}
