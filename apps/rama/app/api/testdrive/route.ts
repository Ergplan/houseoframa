import { startTestDrive } from '@rama/workbench';
import { authMember } from '../../../server/authorize';
import { authDeps } from '../../../server/auth-deps';
import { back, baseUrlOf } from '../../../server/http';
import { jobDb } from '../../../server/jobs';

export const dynamic = 'force-dynamic';

/** POST: starts a Test drive (or shows the one running) and goes to its page. */
export async function POST(req: Request) {
  const who = await authMember(req, authDeps());
  if (who instanceof Response) return who;
  startTestDrive(jobDb, who.name);
  return back(baseUrlOf(req), '/testdrive');
}
