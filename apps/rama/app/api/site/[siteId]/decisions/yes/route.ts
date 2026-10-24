import { handleYes } from '../../ceremony';
import { ceremonyDeps, readBody } from '../../ceremony-deps';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  return handleYes(siteId, await readBody(req), ceremonyDeps(auth));
}
