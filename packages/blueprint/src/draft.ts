// Drafts English through packages/model, only when asked (`rama extract --draft-glossary`,
// `rama site draft`), never inside extract(): phrases for imported symbols that have none (prompt
// glossary.v1) and one-sentence purposes for bricks that have none (prompt purpose.v1).
// Every draft is unconfirmed: it carries no confirmedBy until a named person confirms it (Invariant 6).
import { z } from 'zod';
import { call as modelCall } from '@rama/model';
import type { Blueprint } from '@rama/shared';
import { phraseFor, type Glossary } from './glossary.ts';
import { EXTRACTOR_VERSION } from './extract.ts';
import { byString } from './json.ts';
import { Resolver } from './resolve.ts';

export const DRAFT_COMPONENT = `rama:blueprint-glossary@${EXTRACTOR_VERSION}`;
export const PURPOSE_COMPONENT = `rama:blueprint-purpose@${EXTRACTOR_VERSION}`;
const BATCH = 40;
const PURPOSE_BATCH = 10;
const HEAD_LINES = 60;
const HEAD_CHARS = 2000;

const DraftOutput = z.object({
  phrases: z.array(z.object({ key: z.string(), text: z.string().min(1).max(200) })),
});

export interface DraftOptions {
  siteId: string;
  call?: typeof modelCall;
  /** Called after each batch with everything drafted so far, so the caller can save as it goes. */
  onBatch?: (drafted: Glossary, done: number, total: number) => void;
  /**
   * Called when a batch fails after packages/model's retries; that batch is skipped and drafting goes
   * on (its keys stay without a draft, shown as unknown). Without it, the failure is thrown.
   */
  onError?: (err: Error, keys: string[]) => void;
}

async function attempt<T>(opts: DraftOptions, keys: string[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (!opts.onError) throw err;
    opts.onError(err as Error, keys);
    return null;
  }
}

export interface DraftRequestItem {
  key: string;
  file: string;
  symbol: string;
  /** The lines that declare the symbol, so the phrase is grounded in code. */
  declaration: string;
}

/** The lines that declare `symbol` in a file, or null when the file does not declare it itself. */
function declarationIn(source: string, symbol: string): string | null {
  const lines = source.split('\n');
  const named = new RegExp(`\\bexport\\b(?!\\s*(\\*|\\{[^}]*\\}\\s*from))(?!.*\\bfrom\\s*['"]).*\\b${symbol.replace(/[$]/g, '\\$')}\\b`);
  const at =
    symbol === 'default' ? lines.findIndex((l) => /\bexport\s+default\b/.test(l)) : lines.findIndex((l) => named.test(l));
  return at === -1 ? null : lines.slice(at, at + 8).join('\n').slice(0, 600);
}

const REEXPORT = /^\s*export\s+(\*|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/gm;

/**
 * Where `symbol` is declared, starting at `file` and following `export * from` and `export { … } from`
 * through barrel files (up to 6 hops). Null when no file in reach declares it: the model is then shown
 * nothing and leaves the phrase out, rather than guess.
 */
function findDeclaration(
  file: string,
  symbol: string,
  read: (p: string) => string | null,
  resolver: Resolver,
  depth = 0,
): { file: string; declaration: string } | null {
  const source = read(file);
  if (source === null || depth > 6) return null;
  const own = declarationIn(source, symbol);
  if (own) return { file, declaration: own };
  for (const m of source.matchAll(REEXPORT)) {
    let name = symbol;
    if (m[1] !== '*') {
      const hit = m[2]!
        .split(',')
        .map((x) => x.trim().replace(/^type\s+/, ''))
        .map((x) => x.split(/\s+as\s+/))
        .find((parts) => (parts[1] ?? parts[0]) === symbol);
      if (!hit) continue;
      name = hit[0]!;
    } else if (symbol === 'default') continue; // export * never carries a default
    const r = resolver.resolve(file, m[3]!);
    if (r.kind !== 'internal') continue;
    const found = findDeclaration(r.path, name, read, resolver, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The symbols across edges that have no phrase yet, keyed `<path>#<symbol>`. */
export function missingPhrases(bp: Blueprint, glossary: Glossary, read: (p: string) => string | null): DraftRequestItem[] {
  const resolver = new Resolver({ files: new Set((bp.nodes ?? []).map((n) => n.path)), read });
  const items = new Map<string, DraftRequestItem>();
  for (const e of bp.edges) {
    for (const symbol of e.symbols) {
      if (symbol === '*' || phraseFor(glossary, e.to, symbol)) continue;
      const key = `${e.to}#${symbol}`;
      if (items.has(key)) continue;
      const found = findDeclaration(e.to, symbol, read, resolver);
      items.set(key, { key, file: found?.file ?? e.to, symbol, declaration: found?.declaration ?? '' });
    }
  }
  return [...items.values()].sort((a, b) => byString(a.key, b.key));
}

export async function draftGlossary(
  bp: Blueprint,
  glossary: Glossary,
  read: (p: string) => string | null,
  opts: DraftOptions,
): Promise<Glossary> {
  const call = opts.call ?? modelCall;
  // A symbol no file in reach declares is not asked about: the model would only be told to leave it out.
  const todo = missingPhrases(bp, glossary, read).filter((t) => t.declaration);
  const drafted: Glossary = {};
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await attempt(opts, batch.map((b) => b.key), () =>
      call({
        name: 'glossary',
        version: 1,
        input: { repo: bp.repo, symbols: batch },
        output: DraftOutput,
        role: 'builder',
        siteId: opts.siteId,
        createdBy: DRAFT_COMPONENT,
      }),
    );
    if (!res) continue;
    const asked = new Set(batch.map((b) => b.key));
    for (const p of res.output.phrases) {
      // Only keys that were asked for; a draft never carries a confirmation.
      if (asked.has(p.key)) drafted[p.key] = { text: p.text.trim() };
    }
    opts.onBatch?.(drafted, Math.min(i + BATCH, todo.length), todo.length);
  }
  return drafted;
}

const PurposeOutput = z.object({
  purposes: z.array(z.object({ path: z.string(), text: z.string().min(1).max(300) })),
});

export interface PurposeRequestItem {
  path: string;
  floor: string;
  lines: number;
  exports: string[];
  /** The first lines of the file, so the sentence is grounded in what it holds. */
  head: string;
}

/** Text bricks with no purpose yet, with the head of each file. Binary and empty files are left out. */
export function missingPurposes(bp: Blueprint, purposes: Glossary, read: (p: string) => string | null): PurposeRequestItem[] {
  return bp.nodes
    .filter((n) => !n.binary && n.lines > 0 && !purposes[n.path])
    .map((n) => ({
      path: n.path,
      floor: n.layer,
      lines: n.lines,
      exports: n.exports,
      head: (read(n.path) ?? '').split('\n').slice(0, HEAD_LINES).join('\n').slice(0, HEAD_CHARS),
    }))
    .filter((item) => item.head.trim().length > 0);
}

export async function draftPurposes(
  bp: Blueprint,
  purposes: Glossary,
  read: (p: string) => string | null,
  opts: DraftOptions,
): Promise<Glossary> {
  const call = opts.call ?? modelCall;
  const todo = missingPurposes(bp, purposes, read);
  const drafted: Glossary = {};
  for (let i = 0; i < todo.length; i += PURPOSE_BATCH) {
    const batch = todo.slice(i, i + PURPOSE_BATCH);
    const res = await attempt(opts, batch.map((b) => b.path), () =>
      call({
        name: 'purpose',
        version: 1,
        input: { repo: bp.repo, files: batch },
        output: PurposeOutput,
        role: 'builder',
        siteId: opts.siteId,
        createdBy: PURPOSE_COMPONENT,
        maxTokens: 4000,
      }),
    );
    if (!res) continue;
    const asked = new Set(batch.map((b) => b.path));
    for (const p of res.output.purposes) {
      if (asked.has(p.path)) drafted[p.path] = { text: p.text.trim() };
    }
    opts.onBatch?.(drafted, Math.min(i + PURPOSE_BATCH, todo.length), todo.length);
  }
  return drafted;
}
