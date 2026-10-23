import { authMember } from '../../../server/authorize';
import { authDeps } from '../../../server/auth-deps';
import { book } from '../../../server/floor';
import { withDb } from '../../../server/session';
import { handleBooking } from './handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const member = await authMember(req, authDeps());
  if (member instanceof Response) return member;
  const body = await req.json().catch(() => null);
  return handleBooking(member, body, (m, input) => withDb((db) => book(db, m, input)));
}
