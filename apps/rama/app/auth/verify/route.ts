import { authDeps } from '../../api/auth/deps';
import { handleVerify } from '../../api/auth/handlers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handleVerify(new URL(req.url), authDeps(req));
}
