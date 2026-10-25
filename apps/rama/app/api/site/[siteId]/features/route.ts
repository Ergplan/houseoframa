import { auditLog } from '@rama/db';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readFeatures, writeFeatures, FEATURES_FILE } from '@rama/stage/read';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { baseUrlOf } from '../../../../../server/http';
import { jobDb } from '../../../../../server/jobs';
import { handleNameBuilding } from './handler';

export const dynamic = 'force-dynamic';

/** POST: name this building, in the person's words. */
export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleNameBuilding(a.site, a.member, await req.formData().catch(() => null), {
    blueprint: readSiteBlueprint,
    read: (site) => readFeatures(site.repoDir),
    write: (site, file) => writeFeatures(site.repoDir, file),
    log: (e) =>
      jobDb(async (db) => {
        await db.insert(auditLog).values({
          siteId: e.siteId,
          tableName: FEATURES_FILE,
          rowId: e.building,
          action: 'confirm',
          payload: { name: e.name, does: e.does, at: e.at.toISOString() },
          createdBy: e.personId,
        });
      }),
    baseUrl: baseUrlOf(req),
    now: () => new Date(),
  });
}
