// The campus's inputs (Stage 6): every pod, and every site with its owner, unsigned screens, latest audit,
// handover and check-ins. The figures themselves are metrics.campusFigures.
import { asc, desc, eq } from 'drizzle-orm';
import { checkins, handovers, people, sites, type Db } from '@rama/db';
import type { CampusSite } from '@rama/blueprint/metrics';
import { allPods, podState, siteState, type PodState } from './floor';

export async function campusInputs(
  db: Db,
  now = new Date(),
): Promise<{ pods: PodState[]; sites: (CampusSite & { name: string })[] }> {
  const pods: PodState[] = [];
  for (const p of await allPods(db)) pods.push((await podState(db, p.pod, now))!);
  const rows = await db
    .select({ siteId: sites.siteId, name: sites.name, owner: people.name })
    .from(sites)
    .innerJoin(people, eq(people.id, sites.memberId))
    .orderBy(asc(sites.siteId));
  const out: (CampusSite & { name: string })[] = [];
  for (const r of rows) {
    const st = await siteState(db, r.siteId);
    const [h] = await db
      .select()
      .from(handovers)
      .where(eq(handovers.siteId, r.siteId))
      .orderBy(desc(handovers.at))
      .limit(1);
    const cs = await db.select().from(checkins).where(eq(checkins.siteId, r.siteId));
    out.push({
      siteId: r.siteId,
      name: r.name,
      owner: r.owner,
      unsignedScreens: st?.unsigned ?? 0,
      auditPassed: Boolean(st?.audit && st.audit.commit === st.commit && st.audit.defects === 0),
      handedOverAt: h ? h.at.toISOString() : null,
      checkins: cs.map((c) => ({ at: c.at.toISOString(), inUse: c.inUse })),
    });
  }
  return { pods, sites: out };
}
