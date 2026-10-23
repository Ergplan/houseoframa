// Authorization for route handlers (Stage 6): a request must carry a live session (401 otherwise), and a
// site route needs the member to own the site (404 otherwise, as for a site that does not exist). The
// rules take their dependencies as arguments so every route's authorization is tested without a server.
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { tokenFromCookieHeader } from './session';

export interface AuthDeps {
  memberBySession: (token: string | undefined) => Promise<Member | null>;
  ownedSite: (member: Member, siteId: string) => Promise<SiteLocation | null>;
}

const deny = (status: 401 | 403 | 404, error: string) =>
  Response.json({ ok: false, error }, { status });

export async function authMember(
  req: Request,
  deps: Pick<AuthDeps, 'memberBySession'>,
): Promise<Member | Response> {
  const m = await deps.memberBySession(tokenFromCookieHeader(req.headers.get('cookie')));
  return m ?? deny(401, 'sign in first');
}

export async function authSite(
  req: Request,
  siteId: string,
  deps: AuthDeps,
): Promise<{ member: Member; site: SiteLocation } | Response> {
  const m = await authMember(req, deps);
  if (m instanceof Response) return m;
  const site = await deps.ownedSite(m, siteId);
  return site ? { member: m, site } : deny(404, `no site "${siteId}"`);
}

export async function authManager(
  req: Request,
  deps: Pick<AuthDeps, 'memberBySession'>,
): Promise<Member | Response> {
  const m = await authMember(req, deps);
  if (m instanceof Response) return m;
  return m.role === 'manager' ? m : deny(403, 'the floor manager only');
}
