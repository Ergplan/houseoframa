import { chooseProductSeats } from '@rama/workbench';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { baseUrlOf } from '../../../../../server/http';
import { jobDb } from '../../../../../server/jobs';
import { handleProductBrains } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleProductBrains(a.site, a.member, await req.formData().catch(() => null), {
    choose: (site, seats, who) => jobDb((db) => chooseProductSeats(db, site, seats, who)),
    baseUrl: baseUrlOf(req),
  });
}
