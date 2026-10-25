// The people of version 1 (CLAUDE.md rule 11): `members.json` at the repository root, a list of
// {name, role: trainer | customer, email?}, read at start. Nobody types a password; a person picks their name,
// and that name is the person on every decision, confirmation and signature. The username-and-password
// sign-in of Gaps 1 is kept for the floor edition behind AUTH_MODE=password.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MEMBERS_FILE = 'members.json';

export const MemberEntry = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.enum(['trainer', 'customer']),
    /** Where the person is reached; written as the author of the work House of Rama records for them. */
    email: z.string().trim().email().max(200).optional(),
  })
  .strict();
export type MemberEntry = z.infer<typeof MemberEntry>;

export type AuthMode = 'members' | 'password';

/** `members` (the picker) unless AUTH_MODE=password. Anything else is refused, not guessed. */
export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  const v = env.AUTH_MODE?.trim() || 'members';
  if (v !== 'members' && v !== 'password')
    throw new Error(`AUTH_MODE="${v}" is not a sign-in mode: members (default) or password`);
  return v;
}

/** The House of Rama checkout: RAMA_HOME, else the nearest directory up from cwd with pnpm-workspace.yaml. */
export function homeDir(env: Record<string, string | undefined> = process.env): string {
  if (env.RAMA_HOME) return path.resolve(env.RAMA_HOME);
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('cannot find the House of Rama checkout: set RAMA_HOME');
    dir = up;
  }
}

/** Parses a members list; refuses a name twice rather than letting two people share one. */
export function parseMembers(text: string, file = MEMBERS_FILE): MemberEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${file} is not JSON: expected [{"name", "role": "trainer" | "customer"}]`);
  }
  const list = z.array(MemberEntry).parse(raw);
  const seen = new Set<string>();
  for (const m of list) {
    if (seen.has(m.name)) throw new Error(`${file} names "${m.name}" twice`);
    seen.add(m.name);
  }
  return list;
}

/** The members in members.json; none when the file is missing. */
export function readMembers(env: Record<string, string | undefined> = process.env): MemberEntry[] {
  const file = path.join(homeDir(env), MEMBERS_FILE);
  return existsSync(file) ? parseMembers(readFileSync(file, 'utf8'), file) : [];
}

/**
 * Who owns what is added from the command line or the seed: RAMA_MEMBER_NAME when an engineer or CI
 * sets it, else the first trainer in members.json; undefined when neither names anyone.
 */
export function ownerName(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const named = env.RAMA_MEMBER_NAME?.trim();
  if (named) return named;
  return readMembers(env).find((m) => m.role === 'trainer')?.name;
}
