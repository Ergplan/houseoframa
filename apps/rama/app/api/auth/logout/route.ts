import { tokenFromCookieHeader } from '../../../../server/session';
import { authDeps } from '../deps';
import { handleLogout } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleLogout(tokenFromCookieHeader(req.headers.get('cookie')), authDeps(req));
}
