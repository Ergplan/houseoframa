// The handover (Stage 6): a site's final signed audit, the structure a named person confirmed, and the
// owner's check-ins afterwards. Readiness is metrics.handoverReady; the record is an append-only
// `handovers` row (audited by trigger).
import { asc, desc, eq } from 'drizzle-orm';
import { audits, checkins, handovers, type Db, type Member } from '@rama/db';
import { handoverReady } from '@rama/blueprint/metrics';
import { readSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import {
  confirmedFor,
  draftStructure,
  readStructure,
  type Structure,
} from '@rama/ceremony/structure';
import { latestAudit } from '@rama/audit';

export async function handoverState(db: Db, site: SiteLocation) {
  const bp = readSiteBlueprint(site);
  if (!bp) return null;
  const signedScreens = [...signaturesInForce(readSignoffs(site.repoDir)).values()]
    .filter((s) => s.target.kind === 'screen' && s.target.commit === bp.commit)
    .map((s) => s.target.id);
  const a = await latestAudit(db, site.id);
  const audit = a
    ? {
        id: a.report.reportId,
        commit: a.commit,
        defects: a.body.counts.defects,
        at: a.report.at,
        vendor: a.report.vendor,
        model: a.report.model,
      }
    : null;
  const structure = confirmedFor(readStructure(site.repoDir), bp);
  const readiness = handoverReady({
    bp,
    signedScreens,
    audit,
    structureConfirmedAt: structure?.confirmedAt ?? null,
  });
  const [last] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.siteId, site.id))
    .orderBy(desc(handovers.at))
    .limit(1);
  const reports = await db
    .select()
    .from(checkins)
    .where(eq(checkins.siteId, site.id))
    .orderBy(asc(checkins.at));
  return {
    bp,
    signedScreens,
    audit,
    structure,
    draft: draftStructure(bp),
    readiness,
    handover: last
      ? {
          at: last.at.toISOString(),
          commit: last.commit,
          person: last.person,
          structure: last.structure as unknown as Structure,
          auditId: last.auditId,
        }
      : null,
    checkins: reports.map((c) => ({ at: c.at.toISOString(), inUse: c.inUse, note: c.note })),
  };
}

export class HandoverError extends Error {
  override name = 'HandoverError';
}

/** Hands a ready site over: one append-only row naming the audit, the commit, the structure and the person. */
export async function handOver(db: Db, member: Member, site: SiteLocation, now = new Date()) {
  const st = await handoverState(db, site);
  if (!st) throw new HandoverError('the site has no Blueprint');
  if (!st.readiness.ready) throw new HandoverError(`not ready: ${st.readiness.reasons.join('; ')}`);
  const [a] = await db.select({ id: audits.id }).from(audits).where(eq(audits.id, st.audit!.id));
  const [row] = await db
    .insert(handovers)
    .values({
      siteId: site.id,
      auditId: a!.id,
      commit: st.bp.commit,
      personId: member.id,
      person: member.name,
      structure: st.structure as unknown as Record<string, unknown>,
      at: now,
      createdBy: member.id,
    })
    .returning();
  return row!;
}

/** The owner's report, after handover, of whether the product is in use. */
export async function checkIn(
  db: Db,
  member: Member,
  site: SiteLocation,
  input: { inUse: boolean; note?: string },
  now = new Date(),
) {
  const [h] = await db.select().from(handovers).where(eq(handovers.siteId, site.id)).limit(1);
  if (!h) throw new HandoverError('the site has not been handed over');
  const [row] = await db
    .insert(checkins)
    .values({
      siteId: site.id,
      personId: member.id,
      inUse: input.inUse,
      note: input.note ?? null,
      at: now,
      createdBy: member.id,
    })
    .returning();
  return row!;
}
