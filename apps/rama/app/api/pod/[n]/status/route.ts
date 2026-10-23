import { podState } from '../../../../../server/floor';
import { withDb } from '../../../../../server/session';
import { handlePodStatus } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ n: string }> }) {
  const { n } = await ctx.params;
  return handlePodStatus(n, req.headers.get('authorization'), {
    token: process.env.RAMA_POD_TOKEN,
    podState: (pod) => withDb((db) => podState(db, pod)),
  });
}
