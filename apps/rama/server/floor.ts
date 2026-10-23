// The pod floor (Stage 6): bookings, and the state each pod's light shows. Plain code over the records:
// the light is metrics.podLight over the booked site's Blueprint, its signatures, its photographs and
// its latest audit.
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { bookings, pods, sites, type Db, type Member } from '@rama/db';
import {
  activeBooking,
  podLight,
  signatureCoverage,
  type PodBooking,
  type PodLight,
} from '@rama/blueprint/metrics';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { latestAudit } from '@rama/audit';

export interface SiteState {
  siteId: string;
  name: string;
  commit: string | null;
  screens: number;
  signedScreens: string[];
  /** Screens not signed at the Blueprint's commit (metrics.signatureCoverage). */
  unsigned: number;
  capturedCommit: string | null;
  audit: { commit: string; defects: number; at: string } | null;
}

/** A site's state for the floor: signatures at its Blueprint's commit, its photographs, its latest audit. */
export async function siteState(db: Db, siteId: string): Promise<SiteState | null> {
  const site = locateSite(siteId);
  if (!site) return null;
  const bp = readSiteBlueprint(site);
  const signed = bp
    ? [...signaturesInForce(readSignoffs(site.repoDir)).values()]
        .filter((s) => s.target.kind === 'screen' && s.target.commit === bp.commit)
        .map((s) => s.target.id)
    : [];
  const a = await latestAudit(db, site.id);
  return {
    siteId: site.id,
    name: site.name,
    commit: bp?.commit ?? null,
    screens: bp?.screens.length ?? 0,
    signedScreens: signed,
    unsigned: bp ? signatureCoverage(bp, signed).unsigned : 0,
    capturedCommit: readCapture(site.id)?.commit ?? null,
    audit: a ? { commit: a.commit, defects: a.body.counts.defects, at: a.report.at } : null,
  };
}

const asBooking = (b: typeof bookings.$inferSelect): PodBooking & { id: string } => ({
  id: b.id,
  pod: b.pod,
  siteId: b.siteId,
  personId: b.personId,
  shift: b.shift,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
});

export interface PodState {
  pod: number;
  name: string;
  light: PodLight;
  booking: (PodBooking & { id: string }) | null;
  site: SiteState | null;
}

export async function podState(db: Db, pod: number, now = new Date()): Promise<PodState | null> {
  const [p] = await db.select().from(pods).where(eq(pods.pod, pod));
  if (!p) return null;
  const rows = (
    await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.pod, pod),
          lt(bookings.startsAt, new Date(now.getTime() + 1)),
          gt(bookings.endsAt, now),
        ),
      )
  ).map(asBooking);
  const booking = activeBooking(rows, pod, now);
  const site = booking?.siteId ? await siteState(db, booking.siteId) : null;
  const site$ = site ? locateSite(site.siteId) : null;
  return {
    pod,
    name: p.name,
    booking,
    site,
    light: podLight({
      booking,
      bp: site$ ? readSiteBlueprint(site$) : null,
      signedScreens: site?.signedScreens ?? [],
      capturedCommit: site?.capturedCommit ?? null,
      audit: site?.audit ?? null,
    }),
  };
}

export async function allPods(db: Db): Promise<{ pod: number; name: string }[]> {
  return db.select({ pod: pods.pod, name: pods.name }).from(pods).orderBy(asc(pods.pod));
}

export class BookingError extends Error {
  override name = 'BookingError';
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

/**
 * Books a pod for a member: work on a site they own, or game mode. Refuses a pod that does not exist, a
 * site that is not theirs, an end before the start, and any overlap with another booking of the pod. The
 * overlap check and the insert hold the pod's lock, so two bookings cannot both take one slot.
 */
export async function book(
  db: Db,
  member: Member,
  input: { pod: number; shift: 'work' | 'game'; siteId?: string; startsAt: Date; endsAt: Date },
): Promise<PodBooking & { id: string }> {
  if (!(input.endsAt > input.startsAt))
    throw new BookingError('a booking must end after it starts', 400);
  if (input.shift === 'work' && !input.siteId)
    throw new BookingError('a work booking names a site', 400);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(pods).where(eq(pods.pod, input.pod)).for('update');
    if (!p) throw new BookingError(`no pod ${input.pod}`, 404);
    if (input.shift === 'work') {
      const [s] = await tx.select().from(sites).where(eq(sites.siteId, input.siteId!));
      if (!s || s.memberId !== member.id) throw new BookingError(`no site "${input.siteId}"`, 404);
    }
    const clash = await tx
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.pod, input.pod),
          lt(bookings.startsAt, input.endsAt),
          gt(bookings.endsAt, input.startsAt),
        ),
      );
    if (clash.length) throw new BookingError(`pod ${input.pod} is already booked then`, 409);
    const [row] = await tx
      .insert(bookings)
      .values({
        pod: input.pod,
        siteId: input.shift === 'work' ? input.siteId! : null,
        personId: member.id,
        shift: input.shift,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdBy: member.id,
      })
      .returning();
    return asBooking(row!);
  });
}
