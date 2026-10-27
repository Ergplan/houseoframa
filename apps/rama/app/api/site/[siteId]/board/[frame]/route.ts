import { boardFrame } from '@rama/board';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** A kept frame of the board, for the draft map. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ siteId: string; frame: string }> },
) {
  const { siteId, frame } = await ctx.params;
  const a = await authSite(req, siteId, authDeps());
  if (a instanceof Response) return a;
  const bytes = boardFrame(a.site.id, frame);
  if (!bytes) return Response.json({ ok: false, sentence: 'No such frame.' }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': TYPES[frame.split('.').pop()!]!,
      'cache-control': 'private, max-age=3600',
    },
  });
}
