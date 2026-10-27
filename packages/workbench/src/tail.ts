// The builder's edits as they happen (Stage 11). While a lift runs, House of Rama looks at the product's
// checkout a few times a second and writes each file that changed, before and after, to
// work/<site>/typing.jsonl: the same change the replay reads from a commit, so the code is typed inside
// the glass the same way live and afterwards. It reads the checkout only; it never writes to it.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workDir } from '@rama/blueprint/site';

export interface EditEvent {
  /** Milliseconds since the lift began. */
  at: number;
  lift: number;
  path: string;
  before: string | null;
  after: string | null;
}

const MAX_BYTES = 200_000;
export const typingFile = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId, 'typing.jsonl');

/** The text files of the checkout, tracked and new, that git would not ignore. */
function files(repoDir: string): string[] {
  try {
    return execFileSync('git', ['-C', repoDir, 'ls-files', '-co', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\n')
      .filter((f) => f && /\.(tsx?|jsx?|mjs|json|css|md|sql)$/.test(f));
  } catch {
    return [];
  }
}

function read(repoDir: string, f: string): { mtime: number; text: string | null } {
  const p = path.join(repoDir, f);
  if (!existsSync(p)) return { mtime: 0, text: null };
  const st = statSync(p);
  if (st.size > MAX_BYTES) return { mtime: st.mtimeMs, text: null };
  return { mtime: st.mtimeMs, text: readFileSync(p, 'utf8') };
}

/** Starts watching a lift. `stop()` takes a last look, so a change made just before the end is kept. */
export function startTail(
  repoDir: string,
  siteId: string,
  lift: number,
  opts: { env?: NodeJS.ProcessEnv; everyMs?: number } = {},
): { stop: () => EditEvent[] } {
  const out = typingFile(siteId, opts.env);
  writeFileSync(out, '');
  const started = Date.now();
  const seen = new Map<string, { mtime: number; text: string | null }>();
  for (const f of files(repoDir)) seen.set(f, read(repoDir, f));
  const events: EditEvent[] = [];
  const look = () => {
    const now = new Set(files(repoDir));
    for (const f of new Set([...now, ...seen.keys()])) {
      const prev = seen.get(f) ?? { mtime: 0, text: null };
      const cur = now.has(f) ? read(repoDir, f) : { mtime: 0, text: null };
      if (cur.mtime === prev.mtime && cur.text === prev.text) continue;
      seen.set(f, cur);
      if (cur.text === prev.text) continue;
      const e: EditEvent = {
        at: Date.now() - started,
        lift,
        path: f,
        before: prev.text,
        after: cur.text,
      };
      events.push(e);
      appendFileSync(out, `${JSON.stringify(e)}\n`);
    }
  };
  const timer = setInterval(look, opts.everyMs ?? 400);
  return {
    stop: () => {
      clearInterval(timer);
      look();
      return events;
    },
  };
}

/** The edits of the lift in hand, from the n-th on (what the room has not seen yet). */
export function readEdits(
  siteId: string,
  since = 0,
  env: NodeJS.ProcessEnv = process.env,
): EditEvent[] {
  const f = typingFile(siteId, env);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(since)
    .map((l) => JSON.parse(l) as EditEvent);
}
