// The structural certificate's content (Stage 6): which bricks are load-bearing. Drafted from the
// Blueprint by plain code (the bricks the most other bricks import, metrics.loadBearing), then confirmed
// by a named person into the target's `.rama/structure.json`, a reviewed overlay (Invariant 1). Until
// then it is a draft, shown as unconfirmed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Blueprint } from '@rama/shared';
import { loadBearing } from '@rama/blueprint/metrics';

export const STRUCTURE_FILE = '.rama/structure.json';

export const Structure = z
  .object({
    commit: z.string().min(7),
    bricks: z.array(
      z.object({ path: z.string().min(1), importedBy: z.number().int().min(0) }).strict(),
    ),
    confirmedBy: z.string().min(1),
    confirmedAt: z.string(),
  })
  .strict();
export type Structure = z.infer<typeof Structure>;

/** The bricks at least `min` others import, most-imported first: what the building rests on. */
export function draftStructure(bp: Blueprint, min = 3): Structure['bricks'] {
  return loadBearing(bp, bp.nodes.length)
    .filter((r) => r.count >= min)
    .map((r) => ({ path: r.path, importedBy: r.count }));
}

export function readStructure(repoDir: string): Structure | null {
  const file = path.join(repoDir, STRUCTURE_FILE);
  return existsSync(file) ? Structure.parse(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

/** A named person confirms the drafted structure at the Blueprint's commit. */
export function confirmStructure(
  repoDir: string,
  bp: Blueprint,
  person: string,
  at: Date,
): Structure {
  const s: Structure = {
    commit: bp.commit,
    bricks: draftStructure(bp),
    confirmedBy: person,
    confirmedAt: at.toISOString(),
  };
  mkdirSync(path.join(repoDir, '.rama'), { recursive: true });
  writeFileSync(path.join(repoDir, STRUCTURE_FILE), JSON.stringify(s, null, 2) + '\n');
  return s;
}

/** The structure confirmed for this commit, or null (none, or confirmed for an older commit). */
export const confirmedFor = (s: Structure | null, bp: Blueprint) =>
  s && s.commit === bp.commit ? s : null;
