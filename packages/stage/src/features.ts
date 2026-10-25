// The things a product does, one building each. A product built here carries `.rama/features.json`,
// written by the builder from the decision cards; an outside site has none, so its buildings are drafted
// from its screens, one per screen, and say so (Invariant 6: a drafted name stays unconfirmed until a
// named person confirms it). Pure: no file is read here (see read.ts).
import { z } from 'zod';
import type { Blueprint } from '@rama/shared';

export const FeatureSpec = z.object({
  /** Stable id: lower case, digits and dashes. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** The name in the customer's own words: "Take an order". */
  name: z.string().min(1),
  /** One sentence: what the building does. */
  does: z.string().min(1).optional(),
  /** The screens it shows, by route, screen id or screen name. */
  screens: z.array(z.string().min(1)).default([]),
  /** Files it holds beyond its screens' own: exact paths, or folders ending in `/`. */
  bricks: z.array(z.string().min(1)).default([]),
  /** The decision card it was written from. */
  decision: z.string().min(1).optional(),
  /** Who confirmed the name and when; both or neither. */
  confirmedBy: z.string().min(1).optional(),
  confirmedAt: z.string().min(1).optional(),
});
export type FeatureSpec = z.infer<typeof FeatureSpec>;

export const FeaturesFile = z
  .object({ features: z.array(FeatureSpec) })
  .refine((f) => new Set(f.features.map((x) => x.id)).size === f.features.length, {
    message: 'two features share an id',
  })
  .refine((f) => !f.features.some((x) => RESERVED.has(x.id)), {
    message: 'the ids shared and behind are kept for the buildings House of Rama adds',
  });
export type FeaturesFile = z.infer<typeof FeaturesFile>;

export type BuildingKind = 'feature' | 'shared' | 'behind';
const RESERVED = new Set(['shared', 'behind']);

export interface Feature {
  id: string;
  name: string;
  /** What it does, in a sentence; null when nobody has said. */
  does: string | null;
  kind: BuildingKind;
  /** `file` when the name is from `.rama/features.json`; `draft` when House of Rama drafted it from a screen. */
  source: 'file' | 'draft';
  confirmed: { by: string; at: string } | null;
  decision: string | null;
  /** Blueprint screen ids it shows. */
  screens: string[];
  /** The files that stand in this building (each file stands in one building only). */
  bricks: string[];
  /** Every file its screens use, its own and those it shares. */
  reaches: string[];
}

export interface Features {
  list: Feature[];
  /** Screens the file names that the product does not have. */
  unknownScreens: string[];
  /** Files not drawn on the Street (tests, documents, settings, pictures): seen at the code level. */
  notDrawn: string[];
}

const CODE = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/;
const isCode = (p: string) => CODE.test(p) && !p.endsWith('.d.ts');

/** Whether a file is drawn on the Street at all: code, and not a test. */
export function onStreet(bp: Blueprint, path: string): boolean {
  const n = bp.nodes.find((x) => x.path === path);
  return Boolean(n && !n.test && !n.binary && isCode(path));
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'home'
  );
}

/** One drafted building per screen, named after the screen, unconfirmed. */
export function draftFeatures(bp: Blueprint): FeaturesFile {
  const seen = new Set<string>();
  return {
    features: bp.screens.map((s) => {
      let id = slug(s.id.split(':').at(-1)!);
      while (seen.has(id) || RESERVED.has(id)) id += '-2';
      seen.add(id);
      return { id, name: s.name, screens: [s.id], bricks: [] };
    }),
  };
}

/** Parses a features file, refusing one that does not match its schema. */
export function parseFeatures(json: unknown): FeaturesFile {
  const r = FeaturesFile.safeParse(json);
  if (!r.success)
    throw new Error(`.rama/features.json does not match its schema: ${r.error.message}`);
  return r.data;
}

/**
 * The buildings of the Street, from the features file (or a draft when there is none): each feature with
 * its screens and the files only it uses. A file used by the screens of two or more features stands in
 * the building "Shared by several"; code no screen uses stands in "Behind the screens". Screens the file
 * does not mention get a drafted building each, so no screen is left off the Street.
 */
export function resolveFeatures(bp: Blueprint, file: FeaturesFile | null): Features {
  const given = file ?? draftFeatures(bp);
  const source: Feature['source'] = file ? 'file' : 'draft';
  const unknownScreens: string[] = [];
  const screenOf = (ref: string) =>
    bp.screens.find((s) => s.id === ref) ??
    bp.screens.find((s) => s.route === ref) ??
    bp.screens.find((s) => s.name === ref);
  const claimed = new Set<string>();
  const specs = given.features.map((f) => {
    const screens: string[] = [];
    for (const ref of f.screens) {
      const s = screenOf(ref);
      if (!s) unknownScreens.push(ref);
      else if (!screens.includes(s.id)) {
        screens.push(s.id);
        claimed.add(s.id);
      }
    }
    return { spec: f, screens, source };
  });
  // A screen nobody named still gets a building: drafted from the screen.
  const drafted = draftFeatures(bp).features.filter((d) => !claimed.has(d.screens[0]!));
  const taken = new Set(specs.map((s) => s.spec.id));
  for (const d of drafted) {
    let id = d.id;
    while (taken.has(id)) id += '-2';
    taken.add(id);
    specs.push({ spec: { ...d, id }, screens: d.screens, source: 'draft' });
  }

  const drawn = (p: string) => onStreet(bp, p);
  const reach = specs.map(({ spec, screens }) => {
    const set = new Set<string>();
    for (const id of screens)
      for (const p of bp.screens.find((s) => s.id === id)!.bricks) set.add(p);
    for (const b of spec.bricks) {
      for (const n of bp.nodes)
        if (b.endsWith('/') ? n.path.startsWith(b) : n.path === b) set.add(n.path);
    }
    return [...set].filter(drawn).sort();
  });
  const users = new Map<string, number[]>();
  reach.forEach((paths, i) => paths.forEach((p) => users.set(p, [...(users.get(p) ?? []), i])));

  const list: Feature[] = specs.map(({ spec, screens, source }, i) => ({
    id: spec.id,
    name: spec.name,
    does: spec.does ?? null,
    kind: 'feature',
    source,
    confirmed:
      spec.confirmedBy && spec.confirmedAt ? { by: spec.confirmedBy, at: spec.confirmedAt } : null,
    decision: spec.decision ?? null,
    screens,
    bricks: reach[i]!.filter((p) => users.get(p)!.length === 1),
    reaches: reach[i]!,
  }));
  const shared = [...users]
    .filter(([, u]) => u.length > 1)
    .map(([p]) => p)
    .sort();
  if (shared.length)
    list.push({
      id: 'shared',
      name: 'Shared by several',
      does: 'Work that more than one building uses.',
      kind: 'shared',
      source: 'draft',
      confirmed: null,
      decision: null,
      screens: [],
      bricks: shared,
      reaches: shared,
    });
  const behind = bp.nodes
    .map((n) => n.path)
    .filter((p) => drawn(p) && !users.has(p))
    .sort();
  if (behind.length)
    list.push({
      id: 'behind',
      name: 'Behind the screens',
      does: 'Work no screen uses directly.',
      kind: 'behind',
      source: 'draft',
      confirmed: null,
      decision: null,
      screens: [],
      bricks: behind,
      reaches: behind,
    });
  return {
    list,
    unknownScreens,
    notDrawn: bp.nodes
      .map((n) => n.path)
      .filter((p) => !drawn(p))
      .sort(),
  };
}

/** The building that holds a file, if any. */
export function buildingOf(features: Features, path: string): Feature | null {
  return features.list.find((f) => f.bricks.includes(path)) ?? null;
}

export const MAX_NAME = 80;
export const MAX_DOES = 240;

/**
 * A building named by a person: its name (and sentence) in their words, confirmed by them. A building the
 * file already holds is renamed in place; a drafted one is written into the file with its screens. The
 * two buildings House of Rama adds (shared, behind) are not things the product does and are not named.
 */
export function nameFeature(
  bp: Blueprint,
  file: FeaturesFile | null,
  id: string,
  words: { name: string; does: string | null },
  by: { person: string; at: string },
): FeaturesFile {
  const name = words.name.trim().replace(/\s+/g, ' ');
  const does = words.does?.trim().replace(/\s+/g, ' ') || null;
  if (!name) throw new Error('A building needs a name.');
  if (name.length > MAX_NAME) throw new Error(`A name is at most ${MAX_NAME} characters.`);
  if (does && does.length > MAX_DOES)
    throw new Error(`What it does is at most ${MAX_DOES} characters.`);
  const confirmed = { confirmedBy: by.person, confirmedAt: by.at };
  const features = [...(file?.features ?? [])];
  const at = features.findIndex((f) => f.id === id);
  if (at >= 0) {
    const prev = features[at]!;
    features[at] = { ...prev, name, ...(does ? { does } : {}), ...confirmed };
    if (!does) delete features[at]!.does;
    return parseFeatures({ features });
  }
  const drafted = resolveFeatures(bp, file).list.find(
    (f) => f.id === id && f.kind === 'feature' && f.source === 'draft',
  );
  if (!drafted) throw new Error('There is no such building to name.');
  features.push({
    id,
    name,
    ...(does ? { does } : {}),
    screens: drafted.screens,
    bricks: [],
    ...confirmed,
  });
  return parseFeatures({ features });
}
