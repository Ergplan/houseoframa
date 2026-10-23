import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { checkIn } from '../../../../../server/handover';
import { withDb } from '../../../../../server/session';
import { CheckinBody, handleHandoverAction } from '../handover/handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  const body = CheckinBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json({ ok: false, error: 'expected {inUse, note?}' }, { status: 400 });
  return handleHandoverAction(() => withDb((db) => checkIn(db, auth.member, auth.site, body.data)));
}
