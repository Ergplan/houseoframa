import { authDeps } from '../deps';
import { handleLinkRequest } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handleLinkRequest(body, authDeps(req));
}
