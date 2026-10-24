import { authDeps } from '../deps';
import { handlePick } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  return handlePick(form, authDeps(req));
}
