import { settingsDeps } from '../deps';
import { handleKey } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleKey(await req.formData().catch(() => null), settingsDeps(req));
}
