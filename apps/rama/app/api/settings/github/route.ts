import { settingsDeps } from '../deps';
import { handleGitHub } from '../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleGitHub(await req.formData().catch(() => null), settingsDeps(req));
}
