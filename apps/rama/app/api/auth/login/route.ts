import { authDeps } from '../deps';
import { handleLogin } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  return handleLogin(form, authDeps(req));
}
