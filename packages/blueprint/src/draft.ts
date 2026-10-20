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

export const DRAFT_COMPONENT = `rama:blueprint-glossary@${EXTRACTOR_VERSION}`;
export const PURPOSE_COMPONENT = `rama:blueprint-purpose@${EXTRACTOR_VERSION}`;
const BATCH = 40;
const PURPOSE_BATCH = 10;
const HEAD_LINES = 60;
const HEAD_CHARS = 2000;

const DraftOutput = z.object({
  phrases: z.array(z.object({ key: z.string(), text: z.string().min(1).max(200) })),
});

export interface DraftRequestItem {
  key: string;
  file: string;
  symbol: string;
  /** The lines that declare the symbol, so the phrase is grounded in code. */
  declaration: string;
}

function declarationOf(source: string, symbol: string): string {
  const lines = source.split('\n');
  const named = new RegExp(`\\bexport\\b.*\\b${symbol.replace(/[$]/g, '\\$')}\\b`);
  let at = symbol === 'default' ? lines.findIndex((l) => /\bexport\s+default\b/.test(l)) : lines.findIndex((l) => named.test(l));
  if (at === -1) at = 0;
  return lines.slice(at, at + 8).join('\n').slice(0, 600);
}

/** The symbols across edges that have no phrase yet, keyed `<path>#<symbol>`. */
export function missingPhrases(bp: Blueprint, glossary: Glossary, read: (p: string) => string | null): DraftRequestItem[] {
  const items = new Map<string, DraftRequestItem>();
  for (const e of bp.edges) {
    for (const symbol of e.symbols) {
      if (symbol === '*' || phraseFor(glossary, e.to, symbol)) continue;
      const key = `${e.to}#${symbol}`;
      if (!items.has(key)) items.set(key, { key, file: e.to, symbol, declaration: declarationOf(read(e.to) ?? '', symbol) });
    }
  }
  return [...items.values()].sort((a, b) => byString(a.key, b.key));
}

export async function draftGlossary(
  bp: Blueprint,
  glossary: Glossary,
  read: (p: string) => string | null,
  opts: { siteId: string; call?: typeof modelCall; onBatch?: (drafted: Glossary, done: number, total: number) => void },
): Promise<Glossary> {
  const call = opts.call ?? modelCall;
  const todo = missingPhrases(bp, glossary, read);
  const drafted: Glossary = {};
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await call({
      name: 'glossary',
      version: 1,
      input: { repo: bp.repo, symbols: batch },
      output: DraftOutput,
      role: 'builder',
      siteId: opts.siteId,
      createdBy: DRAFT_COMPONENT,
    });
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
  opts: { siteId: string; call?: typeof modelCall; onBatch?: (drafted: Glossary, done: number, total: number) => void },
): Promise<Glossary> {
  const call = opts.call ?? modelCall;
  const todo = missingPurposes(bp, purposes, read);
  const drafted: Glossary = {};
  for (let i = 0; i < todo.length; i += PURPOSE_BATCH) {
    const batch = todo.slice(i, i + PURPOSE_BATCH);
    const res = await call({
      name: 'purpose',
      version: 1,
      input: { repo: bp.repo, files: batch },
      output: PurposeOutput,
      role: 'builder',
      siteId: opts.siteId,
      createdBy: PURPOSE_COMPONENT,
      maxTokens: 2000,
    });
    const asked = new Set(batch.map((b) => b.path));
    for (const p of res.output.purposes) {
      if (asked.has(p.path)) drafted[p.path] = { text: p.text.trim() };
    }
    opts.onBatch?.(drafted, Math.min(i + PURPOSE_BATCH, todo.length), todo.length);
  }
  return drafted;
}
