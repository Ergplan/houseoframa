import { handleTyping } from '../code/handler';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { codeDeps } from '../../../../../server/code';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleTyping(a.site, new URL(req.url), codeDeps());
}
