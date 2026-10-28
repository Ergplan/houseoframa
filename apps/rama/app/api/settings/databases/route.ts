import { settingsDeps } from '../deps';
import { handleSiteDatabase } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleSiteDatabase(await req.formData().catch(() => null), settingsDeps(req));
}
