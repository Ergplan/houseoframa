// Sessions, and the floor edition's sign-in by username and password. In version 1 a person picks their
// name from members.json (members.ts) and gets a session; with AUTH_MODE=password the accounts in
// `RAMA_ACCOUNTS` sign in instead (the user's choice of 2026-10-24, kept for the floor edition). Either
// way a sign-in opens a session: a random 32-byte token in an httpOnly cookie, of which only the sha256
// is stored; it lasts SESSION_DAYS unless revoked (sign-out).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client.ts';
import { people, sessions } from './schema.ts';

export const SESSION_DAYS = 30;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface Member {
  id: string;
  name: string;
  email: string | null;
  role: 'member' | 'manager' | 'trainer' | 'customer';
}

/** Whether a person sees every site and the campus: a trainer, or a floor manager. */
export const seesEverything = (m: Pick<Member, 'role'>) =>
  m.role === 'trainer' || m.role === 'manager';

const Account = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(8, 'a password needs at least 8 characters'),
    name: z.string().min(1).max(120),
    role: z.enum(['member', 'manager']).default('member'),
  })
  .strict();
export type Account = z.infer<typeof Account>;

/**
 * The accounts in `RAMA_ACCOUNTS`: a JSON array of {username, password, name, role?}. None when unset.
 * A malformed value is an error, not an empty list, so a typo cannot lock everyone out silently.
 */
export function accountsFrom(env: Record<string, string | undefined> = process.env): Account[] {
  const raw = env.RAMA_ACCOUNTS?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('RAMA_ACCOUNTS is not JSON: expected [{"username","password","name","role"?}]');
  }
  const list = z.array(Account).parse(parsed);
  const names = new Set(list.map((a) => a.username));
  if (names.size !== list.length) throw new Error('RAMA_ACCOUNTS has a username twice');
  return list;
}

const same = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};

/** The account these credentials open, or null. Every account is compared, so timing does not tell which failed. */
export function checkCredentials(
  accounts: Account[],
  username: string,
  password: string,
): Account | null {
  let found: Account | null = null;
  for (const a of accounts) {
    // Both compared every time (no short circuit), so a wrong username takes as long as a wrong password.
    const user = same(a.username, username);
    const pass = same(a.password, password);
    const ok = user && pass;
    if (ok) found = a;
  }
  return found;
}

/** The person an account signs in as: found by name (the seeded member keeps their sites), created otherwise. */
export async function ensurePerson(
  db: Db,
  account: { name: string; role: Member['role'] },
  createdBy: string,
): Promise<Member> {
  const [p] = await db.select().from(people).where(eq(people.name, account.name));
  if (p) {
    if (p.role === account.role) return p;
    const [u] = await db
      .update(people)
      .set({ role: account.role })
      .where(eq(people.id, p.id))
      .returning();
    return u!;
  }
  const [n] = await db
    .insert(people)
    .values({ name: account.name, role: account.role, createdBy })
    .returning();
  return n!;
}

/** Opens a session for a person; returns the cookie's token (only its hash is stored). */
export async function openSession(db: Db, personId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    personId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
    createdBy: personId,
  });
  return token;
}

/** The member a session token signs in, or null when it is unknown, expired or revoked. */
export async function memberBySession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<Member | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: people.id, name: people.name, email: people.email, role: people.role })
    .from(sessions)
    .innerJoin(people, eq(people.id, sessions.personId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    );
  return row ?? null;
}

export async function revokeSession(db: Db, token: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(eq(sessions.tokenHash, hashToken(token)));
}
