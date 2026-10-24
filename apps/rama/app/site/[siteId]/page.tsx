import { pageSite } from '../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { unsaidSentence } from '@rama/workbench';
import { SiteView } from '../../../components/site/SiteView';
import { Said } from '../../../components/workbench/Said';
import { SiteShell, auditOf, consoleProps } from '../../../components/workbench/SiteShell';

export const dynamic = 'force-dynamic';

/** Screens whose signature in force (from the target's .rama/signoffs.jsonl) names the Blueprint's commit. */
function signedAt(repoDir: string, commit: string): string[] {
  return [...signaturesInForce(readSignoffs(repoDir)).values()]
    .filter((s) => s.target.kind === 'screen' && s.target.commit === commit)
    .map((s) => s.target.id);
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
  const audit = await auditOf(site.id);
  const cp = (await consoleProps(site, member, audit))!;
  const capture = readCapture(site.id);
  const captured = (capture?.screens ?? []).map((s) => ({
    name: s.name,
    title: s.title,
    shot: s.shot,
    bricks: s.bricks,
  }));
  return (
    <SiteShell site={site} member={member} q={q} console={cp}>
      <div className="site-col">
        <SiteView
          siteId={site.id}
          name={site.name}
          blueprint={blueprint}
          member={member.name}
          captured={captured}
          signedScreens={signedAt(site.repoDir, blueprint.commit)}
          initialBrick={(Array.isArray(brick) ? brick[0] : brick) ?? null}
          audit={audit}
          screenStates={{
            tally: cp.states.tally,
            counts: [
              ...cp.states.counts.map((c) => c.sentence),
              ...(cp.states.unsaid ? [unsaidSentence(cp.states.unsaid)] : []),
            ],
          }}
        />
      </div>
    </SiteShell>
  );
}
