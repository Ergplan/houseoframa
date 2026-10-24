// Registers a cloned site in Postgres so model calls made for it have a site row to point at
// (model_calls.site_id) and it belongs to a person: the owner named by members.json (Stage 7).
import { eq } from 'drizzle-orm';
import { createDb, people, sites } from '@rama/db';
import { EXTRACTOR_VERSION } from './extract.ts';

export const SITE_COMPONENT = `rama:blueprint-site@${EXTRACTOR_VERSION}`;

/** Idempotent: an existing site row is left as it is. Refuses without a seeded member. */
export async function registerSite(
  input: { siteId: string; name: string; repo: string; memberName: string | undefined },
  url = process.env.DATABASE_URL,
): Promise<void> {
  const name = input.memberName?.trim();
  if (!name) throw new Error('no owner: members.json names no trainer and RAMA_MEMBER_NAME is not set');
  const { db, close } = createDb(url);
  try {
    const [member] = await db.select().from(people).where(eq(people.name, name));
    if (!member) throw new Error(`no person "${name}": run \`pnpm db:seed\` first`);
    await db
      .insert(sites)
      .values({ siteId: input.siteId, name: input.name, repo: input.repo, memberId: member.id, createdBy: SITE_COMPONENT })
      .onConflictDoNothing();
  } finally {
    await close();
  }
}
