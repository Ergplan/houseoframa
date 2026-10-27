import { handleStart } from '../handler';
import { readBody } from '../../ceremony-deps';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';
import { voiceDeps } from '../../../../../../server/voice';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleStart(a.site, a.member, await readBody(req), voiceDeps());
}
