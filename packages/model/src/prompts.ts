import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository's prompts/ directory. */
export const PROMPTS_DIR = fileURLToPath(new URL('../../../prompts', import.meta.url));

export interface Prompt {
  name: string;
  version: number;
  file: string;
  text: string;
  /** sha256 of the prompt text, recorded with every call so a row names the exact prompt used. */
  hash: string;
}

/** Loads prompts/<name>.v<version>.md. Prompts are never edited in place; a change is a new version. */
export async function loadPrompt(
  name: string,
  version: number,
  dir = PROMPTS_DIR,
): Promise<Prompt> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid prompt name "${name}"`);
  if (!Number.isInteger(version) || version < 1)
    throw new Error(`invalid prompt version ${version}`);
  const file = path.join(dir, `${name}.v${version}.md`);
  const text = await readFile(file, 'utf8');
  return { name, version, file, text, hash: createHash('sha256').update(text).digest('hex') };
}
