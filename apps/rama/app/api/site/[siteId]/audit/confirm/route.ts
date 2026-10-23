import { eq } from 'drizzle-orm';
import { createDb, people } from '@rama/db';
import { locateSite } from '@rama/blueprint/site';
import { confirmReport } from '@rama/audit';
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return handleConfirmReport(siteId, body, {
    locate: (id) => locateSite(id),
    memberName: process.env.RAMA_MEMBER_NAME,
    personId: (name) =>
      withDb(async (db) => {
        const [p] = await db.select({ id: people.id }).from(people).where(eq(people.name, name));
        if (!p) throw new Error(`no person "${name}": run \`pnpm db:seed\``);
        return p.id;
      }),
    confirm: (input) => withDb((db) => confirmReport(db, input)),
    now: () => new Date(),
  });
}
