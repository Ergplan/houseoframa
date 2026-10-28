import { handleGround } from './handler';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { groundDeps } from '../../../../../server/ground';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleGround(a.site, new URL(req.url), groundDeps());
}
