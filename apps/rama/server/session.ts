// Who is asking (Stage 6): the member a request's session cookie signs in, and the sites they may open.
// A site belongs to one member (sites.member_id); a member sees only their own sites, and anyone else
// is told the site does not exist. Used by every page and route under /site, /pod, /campus and /api.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createDb, memberBySession, sites, type Db, type Member } from '@rama/db';
import { locateSite, type SiteLocation } from '@rama/blueprint/site';

export const SESSION_COOKIE = 'rama_session';

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const conn = createDb();
  try {
    return await fn(conn.db);
  } finally {
    await conn.close();
  }
}

/** The session token in a Cookie header. */
export function tokenFromCookieHeader(header: string | null): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** The ids of the sites a member owns. */
export async function siteIdsOf(db: Db, member: Member): Promise<Set<string>> {
  const rows = await db
    .select({ id: sites.siteId })
    .from(sites)
    .where(eq(sites.memberId, member.id));
  return new Set(rows.map((r) => r.id));
}

/** The site, when it exists and this member owns it; null otherwise (an unknown site and another's look alike). */
export async function ownedSite(
  db: Db,
  member: Member,
  siteId: string,
): Promise<SiteLocation | null> {
  const site = locateSite(siteId);
  if (!site) return null;
  const [row] = await db
    .select({ memberId: sites.memberId })
    .from(sites)
    .where(eq(sites.siteId, site.id));
  return row?.memberId === member.id ? site : null;
}

/** The signed-in member of a page render, or null. */
export async function currentMember(): Promise<Member | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return withDb((db) => memberBySession(db, token));
}

/** The signed-in member of a page render; anyone else is sent to sign in. */
export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect('/login');
  return m;
}

/**
 * A site page's member and site: the member must be signed in (else to /login) and own the site (else
 * not found, the same answer as for a site that does not exist).
 */
export async function pageSite(siteId: string): Promise<{ member: Member; site: SiteLocation }> {
  const member = await requireMember();
  const site = await withDb((db) => ownedSite(db, member, siteId));
  if (!site) notFound();
  return { member, site };
}
