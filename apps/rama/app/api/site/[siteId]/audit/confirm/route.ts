import { createDb } from '@rama/db';
import { confirmReport } from '@rama/audit';
import { authSite } from '../../../../../../server/authorize';
import { authDeps } from '../../../../../../server/auth-deps';
import { handleConfirmReport } from './handler';

export const dynamic = 'force-dynamic';

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const conn = createDb();
  try {
    return await fn(conn.db);
  } finally {
    await conn.close();
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const auth = await authSite(req, siteId, authDeps());
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return handleConfirmReport(siteId, body, {
    locate: (id) => (id === auth.site.id ? auth.site : null),
    memberName: auth.member.name,
    personId: async () => auth.member.id,
    confirm: (input) => withDb((db) => confirmReport(db, input)),
    now: () => new Date(),
  });
}
