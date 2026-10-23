import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';
import { shotResponse } from './shot';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ siteId: string; name: string }> },
) {
  const { siteId, name } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  return shotResponse(auth.site.id, name);
}
