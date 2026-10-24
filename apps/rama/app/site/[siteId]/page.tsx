import { pageSite, withDb } from '../../../server/session';
import { readSiteBlueprint, siteRecord, type SiteLocation } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { latestAudit } from '@rama/audit';
import { toAuditView, type AuditView } from '@rama/audit/view';
import { createDb, listSecrets, seesEverything, type Member } from '@rama/db';
import { currentDecisions, listDecisions } from '@rama/ceremony';
import { jobStatus, latestJob, siteStates, unsaidSentence } from '@rama/workbench';
import type { Blueprint } from '@rama/shared';
import { SiteView } from '../../../components/site/SiteView';
import { TrainerConsole } from '../../../components/workbench/TrainerConsole';
import { Said } from '../../../components/workbench/Said';

export const dynamic = 'force-dynamic';

/** Screens whose signature in force (from the target's .rama/signoffs.jsonl) names the Blueprint's commit. */
function signedAt(repoDir: string, commit: string): string[] {
  return [...signaturesInForce(readSignoffs(repoDir)).values()]
    .filter((s) => s.target.kind === 'screen' && s.target.commit === commit)
    .map((s) => s.target.id);
}

/** The site's latest audit, or null when it has none or the database cannot be reached (the site still renders). */
async function auditOf(siteId: string): Promise<AuditView | null> {
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
async function consoleProps(site: SiteLocation, bp: Blueprint, member: Member) {
  const states = siteStates(site, bp);
  const db = await withDb(async (db) => ({
    cards: currentDecisions(await listDecisions(db, site.id)),
    keys: seesEverything(member) ? await listSecrets(db) : null,
  })).catch(() => ({ cards: [], keys: null }));
  const jobs = (['refresh', 'photograph', 'tests', 'audit'] as const)
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
  };
}

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const q = (await searchParams) ?? {};
  const brick = q.brick;
  const { member, site } = await pageSite(siteId);
  const blueprint = readSiteBlueprint(site);
  if (!blueprint) {
    return (
      <main className="stub workbench">
        <h1>{site.name}</h1>
        <Said q={q} />
        <p>Nothing is drawn for this site yet.</p>
        <form action={`/api/site/${site.id}/act`} method="post">
          <input type="hidden" name="act" value="refresh" />
          <button type="submit" className="primary">
            Draw it now
          </button>
        </form>
      </main>
    );
  }
  const cp = await consoleProps(site, blueprint, member);
  const capture = readCapture(site.id);
  const captured = (capture?.screens ?? []).map((s) => ({
    name: s.name,
    title: s.title,
    shot: s.shot,
    bricks: s.bricks,
  }));
  return (
    <div className="with-console">
      <div className="console-col">
        <Said q={q} />
        <TrainerConsole {...cp} />
      </div>
      <div className="site-col">
        <SiteView
          siteId={site.id}
          name={site.name}
          blueprint={blueprint}
          member={member.name}
          captured={captured}
          signedScreens={signedAt(site.repoDir, blueprint.commit)}
          initialBrick={(Array.isArray(brick) ? brick[0] : brick) ?? null}
          audit={await auditOf(site.id)}
          screenStates={{
            tally: cp.states.tally,
            counts: [
              ...cp.states.counts.map((c) => c.sentence),
              ...(cp.states.unsaid ? [unsaidSentence(cp.states.unsaid)] : []),
            ],
          }}
        />
      </div>
    </div>
  );
}
