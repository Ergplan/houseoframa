// Who is asking (Stage 6): the person a request's session cookie signs in, and the sites they may open.
// A site belongs to one person (sites.member_id). A trainer (version 1) or a floor manager opens every
// site; anyone else sees only their own, and is told another's site does not exist. Used by every page
// and route under /site, /pod, /campus and /api.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createDb, memberBySession, seesEverything, sites, type Db, type Member } from '@rama/db';
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

/** The ids of the sites a person may open: every registered site for a trainer or manager, else their own. */
export async function siteIdsOf(db: Db, member: Member): Promise<Set<string>> {
  const rows = seesEverything(member)
    ? await db.select({ id: sites.siteId }).from(sites)
    : await db.select({ id: sites.siteId }).from(sites).where(eq(sites.memberId, member.id));
  return new Set(rows.map((r) => r.id));
}

/** The site, when it exists and this person may open it; null otherwise (an unknown site and another's look alike). */
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
  if (!row) return null;
  return row.memberId === member.id || seesEverything(member) ? site : null;
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
