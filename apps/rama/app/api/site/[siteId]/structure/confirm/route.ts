import { readSiteBlueprint } from '@rama/blueprint/site';
import { confirmStructure } from '@rama/ceremony/structure';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';
import { HandoverError } from '../../../../../../server/handover';
import { handleHandoverAction } from '../../handover/handlers';

export const dynamic = 'force-dynamic';

/** The signed-in owner confirms the drafted structure of the site at its current commit. */
export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  return handleHandoverAction(async () => {
    const bp = readSiteBlueprint(auth.site);
    if (!bp) throw new HandoverError('the site has no Blueprint');
    return confirmStructure(auth.site.repoDir, bp, auth.member.name, new Date());
  });
}
