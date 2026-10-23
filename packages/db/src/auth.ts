// Sign-in by email link (Stage 6). No passwords. A link token and a session token are random 32 bytes;
// only their sha256 is stored, so a database copy holds nothing to sign in with. A link works once and
// for LINK_MINUTES; a session lasts SESSION_DAYS unless revoked (sign-out).
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from './client.ts';
import { loginLinks, people, sessions } from './schema.ts';

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 30;
export const AUTH_COMPONENT = 'rama:db-auth@0.1.0';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
export const normalEmail = (email: string) => email.trim().toLowerCase();

export interface Member {
  id: string;
  name: string;
  email: string | null;
  role: 'member' | 'manager';
}

/** A member by email, or a new one; an existing person (the pre-Stage 6 local member) gains the email. */
export async function addMember(
  db: Db,
  input: { email: string; name: string; role?: Member['role']; createdBy: string },
): Promise<Member> {
  const email = normalEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error(`not an email address: ${input.email}`);
  const [byEmail] = await db.select().from(people).where(eq(people.email, email));
  if (byEmail) return byEmail;
  const [byName] = await db.select().from(people).where(eq(people.name, input.name));
  if (byName) {
    if (byName.email) throw new Error(`"${input.name}" already signs in as ${byName.email}`);
    const [p] = await db
      .update(people)
      .set({ email, ...(input.role ? { role: input.role } : {}) })
      .where(eq(people.id, byName.id))
      .returning();
    return p!;
  }
  const [p] = await db
    .insert(people)
    .values({ name: input.name, email, role: input.role ?? 'member', createdBy: input.createdBy })
    .returning();
  return p!;
}

/**
 * A sign-in link token for the member with this email, or null when no member has it (the caller says
 * the same thing either way, so the answer does not tell who is a member).
 */
export async function issueLink(
  db: Db,
  email: string,
  now = new Date(),
): Promise<{ token: string; member: Member } | null> {
  const [member] = await db
    .select()
    .from(people)
    .where(eq(people.email, normalEmail(email)));
  if (!member) return null;
  const token = newToken();
  await db.insert(loginLinks).values({
    personId: member.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + LINK_MINUTES * 60_000),
    createdBy: AUTH_COMPONENT,
  });
  return { token, member };
}

/** Spends a link (once, before it expires) and opens a session. Null for a used, expired or unknown link. */
export async function redeemLink(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ sessionToken: string; member: Member } | null> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(loginLinks)
      .set({ usedAt: now })
      .where(
        and(
          eq(loginLinks.tokenHash, hashToken(token)),
          isNull(loginLinks.usedAt),
          gt(loginLinks.expiresAt, now),
        ),
      )
      .returning();
    if (!link) return null;
    const [member] = await tx.select().from(people).where(eq(people.id, link.personId));
    const sessionToken = newToken();
    await tx.insert(sessions).values({
      personId: link.personId,
      tokenHash: hashToken(sessionToken),
      expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
      createdBy: link.personId,
    });
    return { sessionToken, member: member! };
  });
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
