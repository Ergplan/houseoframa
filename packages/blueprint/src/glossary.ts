// `.rama/glossary.json` in the target: a reviewed overlay of English phrases for imported symbols.
//   { "<symbol>" | "<path>#<symbol>": { "text": "...", "confirmedBy"?: "...", "confirmedAt"?: "..." } }
// A path-qualified key wins over a bare symbol. A phrase without confirmedBy is unconfirmed (Invariant 6).
import { z } from 'zod';
import type { ImportEdge } from '@rama/shared';
import { byString } from './json.ts';

export const GlossaryEntry = z.object({
  text: z.string().min(1),
  confirmedBy: z.string().min(1).optional(),
  confirmedAt: z.string().min(1).optional(),
});
export const Glossary = z.record(z.string(), GlossaryEntry);
export type Glossary = z.infer<typeof Glossary>;

export function phraseFor(glossary: Glossary, to: string, symbol: string) {
  return glossary[`${to}#${symbol}`] ?? (symbol === 'default' || symbol === '*' ? undefined : glossary[symbol]);
}

/**
 * Sets `english` on each edge that has at least one phrase. The text joins the phrases in symbol
 * order. It is confirmed only when every symbol across the edge has a phrase and every phrase is
 * confirmed; then `by` lists the confirmers and `at` is the latest confirmation.
 */
export function mergeGlossary(edges: ImportEdge[], glossary: Glossary): ImportEdge[] {
  return edges.map((edge) => {
    const found = edge.symbols.map((s) => phraseFor(glossary, edge.to, s));
    const phrases = found.filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (!phrases.length) return edge;
    const confirmed = found.every((p) => p?.confirmedBy && p.confirmedAt);
    const english: NonNullable<ImportEdge['english']> = {
      text: phrases.map((p) => p.text).join('; '),
      confirmed,
    };
    if (confirmed) {
      english.by = [...new Set(phrases.map((p) => p.confirmedBy!))].sort(byString).join(', ');
      english.at = phrases.map((p) => p.confirmedAt!).sort(byString).at(-1)!;
    }
    return { ...edge, english };
  });
}
