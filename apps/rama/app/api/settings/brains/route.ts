import { settingsDeps } from '../deps';
import { handleBrains } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleBrains(await req.formData().catch(() => null), settingsDeps(req));
}
