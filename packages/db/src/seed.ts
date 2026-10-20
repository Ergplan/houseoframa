import { eq } from 'drizzle-orm';
import pkg from '../package.json' with { type: 'json' };
import type { Db } from './client.ts';
import { people, sites } from './schema.ts';

export const SEED_COMPONENT = `rama:db-seed@${pkg.version}`;
export const SELF_SITE_ID = 'self';

/**
 * Creates the single local member and the "self" site (this repository), owned by that member.
 * Idempotent: running it again changes nothing. Refuses without a member name rather than inventing one.
 */
export async function seed(db: Db, opts: { memberName?: string }) {
  const name = opts.memberName?.trim();
  if (!name) throw new Error('RAMA_MEMBER_NAME is not set: the seed will not invent a member');

  await db.insert(people).values({ name, createdBy: SEED_COMPONENT }).onConflictDoNothing();
  const [member] = await db.select().from(people).where(eq(people.name, name));
  if (!member) throw new Error(`seed: person "${name}" was not created`);

  await db
    .insert(sites)
    .values({
      siteId: SELF_SITE_ID,
      name: 'House of Rama',
      repo: '.',
      memberId: member.id,
      createdBy: SEED_COMPONENT,
    })
    .onConflictDoNothing();
  const [site] = await db.select().from(sites).where(eq(sites.siteId, SELF_SITE_ID));
  if (!site) throw new Error('seed: site "self" was not created');
  return { member, site };
}
