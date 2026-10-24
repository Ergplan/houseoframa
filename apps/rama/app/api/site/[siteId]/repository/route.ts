import { createProductRepository } from '@rama/workbench';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { back, baseUrlOf } from '../../../../../server/http';
import { withDb } from '../../../../../server/session';

export const dynamic = 'force-dynamic';

/** POST: Create repository for a product built here, under the GitHub account in Settings. */
export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  const flag = await withDb((db) => createProductRepository(db, a.site.id));
  return back(baseUrlOf(req), `/site/${a.site.id}`, {
    ok: flag.ok,
    sentence: [flag.sentence, flag.next].filter(Boolean).join(' '),
  });
}
