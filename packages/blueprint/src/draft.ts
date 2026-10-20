// Drafts English phrases for imported symbols that have none, through packages/model (prompt
// glossary.v1). Runs only when asked (`rama extract --draft-glossary`), never inside extract().
// Every draft is unconfirmed: it carries no confirmedBy until a named person confirms it (Invariant 6).
import { z } from 'zod';
import { call as modelCall } from '@rama/model';
import type { Blueprint } from '@rama/shared';
import { phraseFor, type Glossary } from './glossary.ts';
import { EXTRACTOR_VERSION } from './extract.ts';
import { byString } from './json.ts';

export const DRAFT_COMPONENT = `rama:blueprint-glossary@${EXTRACTOR_VERSION}`;
const BATCH = 40;

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
  opts: { siteId: string; call?: typeof modelCall },
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
  }
  return drafted;
}
