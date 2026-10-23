import { handleDecide } from '../ceremony';
import { ceremonyDeps, readBody } from '../ceremony-deps';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  return handleDecide(siteId, await readBody(req), ceremonyDeps());
}
