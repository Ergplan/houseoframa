// GET film: the film of a product as it stands now, for a page following a build in place (Stage 13).
import { readSiteBlueprint } from '@rama/blueprint/site';
import { siteFilm, siteLakefront } from '@rama/workbench';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { readSiteRecordName } from '../../../../../server/film';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  const bp = readSiteBlueprint(a.site);
  const lf = bp && a.site.kind === 'product' ? siteLakefront(a.site, bp) : null;
  return Response.json({
    ok: true,
    film: siteFilm(a.site, bp, readSiteRecordName(a.site), lf),
    street: lf?.street ?? null,
  });
}
