import { shotResponse } from './shot';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string; name: string }> },
) {
  const { siteId, name } = await ctx.params;
  return shotResponse(siteId, name);
}
