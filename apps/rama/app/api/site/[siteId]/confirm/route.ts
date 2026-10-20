import { eq } from 'drizzle-orm';
import { auditLog, createDb, people } from '@rama/db';
import { confirmEdge, confirmPurpose, locateSite } from '@rama/blueprint/site';
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return handleConfirm(siteId, body, {
    locate: (id) => locateSite(id),
    memberName: process.env.RAMA_MEMBER_NAME,
    personId: (name) =>
      withDb(async (db) => {
        const [p] = await db.select({ id: people.id }).from(people).where(eq(people.name, name));
        if (!p) throw new Error(`no person "${name}": run \`pnpm db:seed\``);
        return p.id;
      }),
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
    now: () => new Date(),
  });
}
