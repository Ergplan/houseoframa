// Reads a product's `.rama/features.json` from its checkout (server only). A file that does not parse
// is reported, never guessed at: the Street then shows drafted buildings and says why.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFeatures, type FeaturesFile } from './features.ts';

export const FEATURES_FILE = '.rama/features.json';

export function readFeatures(repoDir: string): {
  file: FeaturesFile | null;
  problem: string | null;
} {
  const p = path.join(repoDir, FEATURES_FILE);
  if (!existsSync(p)) return { file: null, problem: null };
  try {
    return { file: parseFeatures(JSON.parse(readFileSync(p, 'utf8'))), problem: null };
  } catch (err) {
    return { file: null, problem: (err as Error).message };
  }
}

/** Writes the features file into the product's `.rama/` (the only folder House of Rama writes in a checkout). */
export function writeFeatures(repoDir: string, file: FeaturesFile): void {
  mkdirSync(path.join(repoDir, '.rama'), { recursive: true });
  writeFileSync(path.join(repoDir, FEATURES_FILE), `${JSON.stringify(file, null, 2)}\n`);
}
