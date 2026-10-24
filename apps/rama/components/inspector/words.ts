// The inspector's sentences. Every number in them comes from packages/blueprint/metrics (Invariant 7);
// where the Blueprint has no English for something, the sentence says so rather than inventing it
// (rule 12). The reviewer paragraph is ported from the weekend prototype's reviewerLine()
// (reference/weekend-prototype/house-of-rama.html).
import type { Blueprint, ImportEdge } from '@rama/shared';
import { dependenciesByFloor, type BrickFigures } from '@rama/blueprint/metrics';

/** Bricks with this many dependants or more get the reviewer's warning. */
export const WARN_DEPENDANTS = 4;

const shortName = (path: string) =>
  path
    .split('/')
    .pop()!
    .replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs|css|json|md)$/, '');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function floorName(bp: Blueprint, layer: string): string {
  const label = bp.layers.find((l) => l.id === layer)?.label ?? layer;
  return (label.split(' — ')[0] || layer).toLowerCase();
}

/** One paragraph a person who pays for the software can read: what the brick needs, who relies on it, and the risk. */
export function reviewerParagraph(bp: Blueprint, path: string, figures: BrickFigures): string {
  const parts = dependenciesByFloor(bp, path).map(
    (g) =>
      `${g.paths.length} on the ${floorName(bp, g.layer)} floor (${g.paths.map(shortName).join(', ')})`,
  );
  const n = figures.dependsOn;
  const needs = n
    ? `It needs ${n} other ${plural(n, 'brick', 'bricks')}: ${parts.join('; ')}.`
    : 'It needs nothing else in the repository to do its job.';
  const m = figures.usedBy;
  const used =
    m === 0
      ? ' Nothing else relies on it, so it can change without side effects elsewhere.'
      : m === 1
        ? ' 1 brick relies on it, so a change here is felt there.'
        : ` ${m} bricks rely on it, so a change here is felt in all of them.`;
  const warn =
    m >= WARN_DEPENDANTS
      ? ' With this many dependants, this is one of the bricks a reviewer should read first.'
      : '';
  return needs + used + warn;
}

export type PhraseState = 'confirmed' | 'unconfirmed' | 'none';

/** What one brick takes from another, in English, and whether a named person confirmed it. */
export function edgePhrase(e: ImportEdge): { text: string; state: PhraseState } {
  if (e.english)
    return { text: e.english.text, state: e.english.confirmed ? 'confirmed' : 'unconfirmed' };
  if (!e.symbols.length)
    return { text: 'loaded for its side effects; no names are imported', state: 'none' };
  const names = e.symbols.map((s) =>
    s === '*' ? 'everything it exports' : s === 'default' ? 'its default export' : s,
  );
  return {
    text: `no English yet for ${names.join(', ')}${e.typeOnly ? ' (types only)' : ''}`,
    state: 'none',
  };
}
