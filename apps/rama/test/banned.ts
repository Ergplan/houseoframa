// The glossary's banned words (design/harmony/glossary.json): developer vocabulary that must not appear
// at the Street or Building level. `bannedIn` finds them in visible text, as whole words in any form a
// sentence gives them (repo, repos; commit, commits, committed; …), whatever their case.
import { readFileSync } from 'node:fs';

const glossary = JSON.parse(
  readFileSync(new URL('../../../design/harmony/glossary.json', import.meta.url), 'utf8'),
) as { banned: string[] };

export const BANNED = glossary.banned;

const forms = (w: string) =>
  w.endsWith('y') ? `${w.slice(0, -1)}(?:y|ies)` : `${w}(?:s|es|ed|ted|ing|ting)?`;
const pattern = new RegExp(`\\b(?:${BANNED.map(forms).join('|')})\\b`, 'gi');

/** Every banned word found in the text, as it was written. */
export function bannedIn(text: string): string[] {
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

/** What a person reads in static markup: the text, and the labels, titles and placeholders. */
export function visibleText(html: string): string {
  const attrs = [...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map(
    (m) => m[1],
  );
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return [text, ...attrs]
    .join(' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}
