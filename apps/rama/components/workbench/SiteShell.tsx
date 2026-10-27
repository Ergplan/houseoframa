// A site's chrome (Stage 7, Harmony): the Shell with the trainer console in the sidebar and a breadcrumb
// in plain words. The site's page and its Showroom, office, walkthrough, audit and handover pages all
// wear it, so the console is beside every view of a site.
import type { ReactNode } from 'react';
import { readSiteBlueprint, siteRecord, type SiteLocation } from '@rama/blueprint/site';
import { latestAudit } from '@rama/audit';
import { toAuditView, type AuditView } from '@rama/audit/view';
import { currentDecisions, listDecisions, listSessions } from '@rama/ceremony';
import { createDb, listSecrets, seesEverything, type Member } from '@rama/db';
import { readCapture } from '@rama/trace/showroom';
import { jobStatus, latestJob, siteStates, type SiteStates } from '@rama/workbench';
import { withDb } from '../../server/session';
import { Shell } from '../harmony/Shell';
import { CarePanel, JourneyBar, type ConsoleProps } from './TrainerConsole';
import { tabOf } from './journey';
import { Said } from './Said';

/** The site's latest audit, or null when it has none or the database cannot be reached (the site still renders). */
export async function auditOf(siteId: string): Promise<AuditView | null> {
  try {
    const conn = createDb();
    try {
      const a = await latestAudit(conn.db, siteId);
      return a ? toAuditView(a) : null;
    } finally {
      await conn.close();
    }
  } catch {
    return null;
  }
}

/** The console's records; a database that cannot be reached leaves the cards and key lights out. */
export async function consoleProps(
  site: SiteLocation,
  member: Member,
  audit?: AuditView | null,
): Promise<ConsoleProps | null> {
  const bp = readSiteBlueprint(site);
  if (!bp) return null;
  const states: SiteStates = siteStates(site, bp);
  const db = await withDb(async (db) => ({
    cards: currentDecisions(await listDecisions(db, site.id)),
    keys: seesEverything(member) ? await listSecrets(db) : null,
    sessions: (await listSessions(db, site.id)).length,
  })).catch(() => ({ cards: [], keys: null, sessions: 0 }));
  const jobs = (['build', 'refresh', 'photograph', 'tests', 'audit'] as const)
    .map((kind) => ({ kind, job: latestJob(kind, site.id) }))
    .filter((j): j is { kind: typeof j.kind; job: NonNullable<typeof j.job> } => j.job !== null)
    .map((j) => ({ ...j, status: jobStatus(j.job) }));
  return {
    siteId: site.id,
    name: site.name,
    kind: site.kind,
    remote: siteRecord(site.id)?.remote ?? null,
    states,
    ...db,
    jobs,
    captured: readCapture(site.id) !== null,
    audited: (audit === undefined ? await auditOf(site.id) : audit) !== null,
  };
}

export async function SiteShell({
  site,
  member,
  here,
  q = {},
  console: given,
  levels,
  children,
}: {
  site: SiteLocation;
  member: Member;
  /** The view within the site, for the breadcrumb (none on the site's own page). */
  here?: string;
  /** The lakefront's levels after the site's name (Street › Take an order › the code), last one current. */
  levels?: { label: string; href?: string }[];
  q?: Record<string, string | string[] | undefined>;
  /** Console props already computed by the page, to avoid reading them twice. */
  console?: ConsoleProps | null;
  children: ReactNode;
}) {
  const cp = given === undefined ? await consoleProps(site, member) : given;
  return (
    <Shell
      here={null}
      member={member}
      crumbs={[
        { label: 'Home', href: '/' },
        here || levels?.length
          ? { label: site.name, href: `/site/${site.id}` }
          : { label: site.name },
        ...(here ? [{ label: here }] : []),
        ...(levels ?? []),
      ]}
    >
      {cp ? <JourneyBar p={cp} tab={tabOf(here)} /> : null}
      <Said q={q} />
      {here === 'Care' && cp ? <CarePanel p={cp} /> : null}
      {children}
    </Shell>
  );
}
