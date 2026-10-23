import { auditLog, createDb } from '@rama/db';
import { confirmEdge, confirmPurpose, restoreOverlay, snapshotOverlay } from '@rama/blueprint/site';
import { authSite } from '../../../../../server/authorize';
import { authDeps } from '../../../../../server/auth-deps';
import { handleConfirm } from './handler';

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
  return handleConfirm(siteId, body, {
    locate: (id) => (id === auth.site.id ? auth.site : null),
    memberName: auth.member.name,
    personId: async () => auth.member.id,
    confirmEdge,
    confirmPurpose,
    log: (e) =>
      withDb(async (db) => {
        await db.insert(auditLog).values(
          e.keys.map((key) => ({
            siteId: e.siteId,
            tableName: e.file,
            rowId: key,
            action: 'confirm',
            payload: { text: e.text, at: e.at.toISOString() },
            createdBy: e.personId,
          })),
        );
      }),
    snapshot: snapshotOverlay,
    restore: (site, file, snap) => void restoreOverlay(site, file, snap),
    now: () => new Date(),
  });
}
