import { handleFile } from '../../handler';
import { ideaDeps } from '../../deps';
import { authSite } from '../../../../../../../server/authorize';
import { authDeps } from '../../../../../../../server/auth-deps';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ siteId: string; name: string }> },
) {
  const { siteId, name } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleFile(a.site, decodeURIComponent(name), ideaDeps());
}
