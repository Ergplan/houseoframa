import { cameraFrom } from '@rama/stage';
import { pageSite } from '../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { building as buildingScene } from '@rama/stage';
import { buildingTrails, siteLakefront, unsaidSentence } from '@rama/workbench';
import { SiteView } from '../../../components/site/SiteView';
import { Said } from '../../../components/workbench/Said';
import { SiteShell, auditOf, consoleProps } from '../../../components/workbench/SiteShell';
import { StreetView } from '../../../components/lakefront/StreetView';
import { BuildingView } from '../../../components/lakefront/BuildingView';
import { CodeCamera } from '../../../components/lakefront/CameraRing';
import { CodePane } from '../../../components/lakefront/CodePane';
import { placeHref } from '../../../components/lakefront/places';

export const dynamic = 'force-dynamic';

/** Screens whose signature in force (from the target's .rama/signoffs.jsonl) names the Blueprint's commit. */
function signedAt(repoDir: string, commit: string): string[] {
  return [...signaturesInForce(readSignoffs(repoDir)).values()]
    .filter((s) => s.target.kind === 'screen' && s.target.commit === commit)
    .map((s) => s.target.id);
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * A site's lakefront (Stage 8): the Street is its home; `?b=<building>` opens a building; `?at=code`
 * (or a decision card's `?brick=`) is the code, the Brick canvas of Stage 2.
 */
export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const q = (await searchParams) ?? {};
  const brick = one(q.brick);
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
  const lf = siteLakefront(site, blueprint, process.env, cp.states);
  const chosen = lf.street.buildings.find((b) => b.id === one(q.b)) ?? null;
  const level =
    one(q.at) === 'code' || (brick && !chosen) ? 'code' : chosen ? 'building' : 'street';
  const street = { label: 'Street', href: placeHref(site.id, { level: 'street' }) };
  const levels =
    level === 'street'
      ? [{ label: 'Street' }]
      : level === 'building'
        ? [street, { label: chosen!.name }]
        : [
            street,
            ...(chosen
              ? [
                  {
                    label: chosen.name,
                    href: placeHref(site.id, { level: 'building', building: chosen.id }),
                  },
                ]
              : []),
            { label: 'the code' },
          ];

  if (level === 'street') {
    return (
      <SiteShell site={site} member={member} q={q} console={cp} levels={levels}>
        <StreetView
          siteId={site.id}
          name={site.name}
          street={lf.street}
          flags={lf.flags}
          history={{
            commits: blueprint.commits,
            nodes: blueprint.nodes.map((n) => ({ path: n.path, firstCommit: n.firstCommit })),
          }}
          audit={audit}
          selected={one(q.sel)}
          named={lf.named}
          problem={lf.problem}
          unknownScreens={lf.features.unknownScreens}
          camera={cameraFrom(q, 'street', null)}
        />
      </SiteShell>
    );
  }

  if (level === 'building') {
    const nodes = new Map(blueprint.nodes.map((n) => [n.path, n]));
    const scene = buildingScene(
      chosen!,
      lf.facades[chosen!.id] ?? [],
      (p) => nodes.get(p)!,
      new Set(blueprint.screens.map((s) => s.file)),
    );
    const keys = scene.facades.flatMap((f) => f.figures.map((g) => g.key));
    return (
      <SiteShell site={site} member={member} q={q} console={cp} levels={levels}>
        <BuildingView
          siteId={site.id}
          building={chosen!}
          scene={scene}
          flag={lf.flags[chosen!.id]!}
          trails={buildingTrails(
            site,
            blueprint,
            keys,
            signaturesInForce(readSignoffs(site.repoDir)),
          )}
          initialFigure={one(q.figure)}
          verdicts={Object.fromEntries(
            chosen!.bricks.flatMap((p) => (audit?.verdicts[p] ? [[p, audit.verdicts[p]!]] : [])),
          )}
          all={lf.street.buildings.map((b) => ({ id: b.id, name: b.name }))}
          camera={cameraFrom(q, 'building', chosen!.id)}
        />
      </SiteShell>
    );
  }

  const capture = readCapture(site.id);
  const captured = (capture?.screens ?? []).map((s) => ({
    name: s.name,
    title: s.title,
    shot: s.shot,
    bricks: s.bricks,
  }));
  return (
    <SiteShell site={site} member={member} q={q} console={cp} levels={levels}>
      <CodeCamera siteId={site.id} start={cameraFrom(q, 'code', chosen?.id ?? null)} />
      <CodePane siteId={site.id} path={brick ?? null} member={member.name} />
      <div className="site-col">
        <SiteView
          siteId={site.id}
          name={site.name}
          blueprint={blueprint}
          member={member.name}
          captured={captured}
          signedScreens={signedAt(site.repoDir, blueprint.commit)}
          initialBrick={brick}
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
