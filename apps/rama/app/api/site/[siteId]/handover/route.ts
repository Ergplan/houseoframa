import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { handOver } from '../../../../../server/handover';
import { withDb } from '../../../../../server/session';
import { handleHandoverAction } from './handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  return handleHandoverAction(() => withDb((db) => handOver(db, auth.member, auth.site)));
}
