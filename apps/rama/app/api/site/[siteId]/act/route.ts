import { startSession } from '@rama/ceremony';
import {
  callAudit,
  pauseBuild,
  photograph,
  productBuilder,
  refreshSite,
  runTests,
  startBuild,
  startJob,
} from '@rama/workbench';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { baseUrlOf } from '../../../../../server/http';
import { jobDb } from '../../../../../server/jobs';
import { handleAct } from './handler';

export const dynamic = 'force-dynamic';

const STEP = {
  refresh: 'Refresh the picture',
  photograph: 'Photograph the screens',
  tests: 'Run the tests',
  audit: 'Call the audit',
} as const;

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleAct(a.site, a.member, await req.formData().catch(() => null), {
    startJob: (kind, site, who) =>
      void startJob({ kind, siteId: site.id, person: who.name }, async (step) => {
        await step(STEP[kind], () =>
          kind === 'refresh'
            ? refreshSite(site)
            : kind === 'photograph'
              ? photograph(site)
              : kind === 'tests'
                ? runTests(site)
                : jobDb((db) => callAudit(db, site)),
        );
      }),
    startSession: async (site, title, who) =>
      void (await jobDb((db) => startSession(db, site.id, { title, createdBy: who.id }))),
    startBuild: (site, who) =>
      void productBuilder(jobDb, site).then((driver) =>
        startBuild(jobDb, site, { driver, person: who.name, createdBy: who.id }),
      ),
    pauseBuild: (site) => pauseBuild(site.id),
    baseUrl: baseUrlOf(req),
    now: () => new Date(),
  });
}
