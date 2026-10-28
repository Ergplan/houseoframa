import { handleAgree } from '../handler';
import { ideaDeps } from '../deps';
import { readBody } from '../../ceremony-deps';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleAgree(a.site, a.member, await readBody(req), ideaDeps());
}
