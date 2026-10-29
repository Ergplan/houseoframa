import { jobStatus, latestJob } from '@rama/workbench';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { handleJobs } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  return handleJobs(a.site, { latest: (kind, id) => latestJob(kind, id), status: jobStatus });
}
