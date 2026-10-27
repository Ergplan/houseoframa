import { newRehearsal } from '@rama/ears';
import { authMember } from '../../../server/authorize';
import { authDeps } from '../../../server/auth-deps';
import { back, baseUrlOf } from '../../../server/http';
import { jobDb } from '../../../server/jobs';
import { handleRehearsal } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const who = await authMember(req, authDeps());
  if (who instanceof Response) return who;
  return handleRehearsal(who, {
    make: (m) => jobDb((db) => newRehearsal(db, m)),
    baseUrl: baseUrlOf(req),
    back,
  });
}
