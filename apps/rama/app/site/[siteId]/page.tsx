import { cameraFrom, insideFiles } from '@rama/stage';
import { pageSite } from '../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { building as buildingScene } from '@rama/stage';
import {
  buildingFlows,
  buildingTrails,
  groundTable,
  siteLakefront,
  unsaidSentence,
} from '@rama/workbench';
import { Said } from '../../../components/workbench/Said';
import { SiteShell, auditOf, consoleProps } from '../../../components/workbench/SiteShell';
import { StreetView } from '../../../components/lakefront/StreetView';
import { BuildingView } from '../../../components/lakefront/BuildingView';
import { InsideView } from '../../../components/lakefront/InsideView';
import { GroundView } from '../../../components/lakefront/GroundView';
import { loadGround } from '../../api/site/[siteId]/ground/handler';
import { groundDeps } from '../../../server/ground';
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
 * (or a decision card's `?brick=`) is the inside of the building (Stage 11), where each brick opens to
 * its code; `?ground=<table>` is a table of the ground, opened to its columns and its real rows.
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
  // The ground's tables and the buildings that use each, for "open orders" and "show me the table".
  const tables = lf.street.plots.map((x) => ({ name: x.table, by: [...x.writtenBy, ...x.readBy] }));
  const all = lf.street.buildings.map((b) => ({ id: b.id, name: b.name }));
  const street = { label: 'Street', href: placeHref(site.id, { level: 'street' }) };

  // A table of the ground, opened (Stage 11): a level of the stage, under the same camera.
  const opened = one(q.ground);
  if (opened) {
    const table = groundTable(site, blueprint, lf.street, opened, readCapture(site.id));
    if (!table)
      return (
        <SiteShell
          site={site}
          member={member}
          q={q}
          console={cp}
          levels={[street, { label: 'the ground' }]}
        >
          <p>The product keeps no table called {opened}.</p>
        </SiteShell>
      );
    const def = blueprint.tables.find((t) => t.name === opened)!;
    return (
      <SiteShell
        site={site}
        member={member}
        q={q}
        console={cp}
        levels={[street, { label: 'the ground' }, { label: opened }]}
      >
        <GroundView
          key={opened}
          siteId={site.id}
          table={table}
          page={await loadGround(site, def, 0, groundDeps())}
          camera={{ ...cameraFrom(q, 'ground', null), table: opened }}
          all={all}
          tables={tables}
        />
      </SiteShell>
    );
  }
  const level =
    one(q.at) === 'code' || (brick && !chosen) ? 'code' : chosen ? 'building' : 'street';
  const levels =
    level === 'street'
      ? [{ label: 'Street' }]
      : level === 'building'
        ? [street, { label: chosen!.name }]
        : [street, { label: 'inside' }];

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
          // One view per building: "Next building" starts a fresh camera on the next one (reviewer run 6).
          key={chosen!.id}
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
          initialFlow={one(q.flow)}
          tables={tables}
          verdicts={Object.fromEntries(
            chosen!.bricks.flatMap((p) => (audit?.verdicts[p] ? [[p, audit.verdicts[p]!]] : [])),
          )}
          all={lf.street.buildings.map((b) => ({ id: b.id, name: b.name }))}
          camera={cameraFrom(q, 'building', chosen!.id)}
          flows={buildingFlows(site, blueprint, keys)}
          tableFiles={Object.fromEntries((blueprint.tables ?? []).map((t) => [t.name, t.file]))}
        />
      </SiteShell>
    );
  }

  // The inside of a building (Stage 11): the third level, under the same camera. A brick of no
  // building chosen opens inside the one it stands in; with neither, the first building.
  const files = insideFiles(blueprint, lf.street.buildings);
  const owner = brick
    ? lf.street.buildings.find((b) => files.get(b.id)!.includes(brick))
    : undefined;
  const into = chosen ?? owner ?? lf.street.buildings[0] ?? null;
  if (!into) {
    return (
      <SiteShell site={site} member={member} q={q} console={cp} levels={levels}>
        <p>Nothing stands on the Street yet, so there is no building to go inside.</p>
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
  const nodes = new Map(blueprint.nodes.map((n) => [n.path, n]));
  const screenFiles = new Set(blueprint.screens.map((s) => s.file));
  const scene = buildingScene(into, lf.facades[into.id] ?? [], (p) => nodes.get(p)!, screenFiles);
  const keys = scene.facades.flatMap((f) => f.figures.map((g) => g.key));
  const flows = buildingFlows(site, blueprint, keys);
  // The file of the screen each figure is shown on, so the water reaches that screen's brick.
  const flowScreens = Object.fromEntries(
    Object.keys(flows).map((k) => {
      const shown = capture?.screens.find((x) => k.startsWith(`${x.name}/`));
      return [k, shown?.bricks.find((b) => screenFiles.has(b)) ?? null];
    }),
  );
  return (
    <SiteShell
      site={site}
      member={member}
      q={q}
      console={cp}
      levels={[
        street,
        { label: into.name, href: placeHref(site.id, { level: 'building', building: into.id }) },
        { label: 'inside' },
      ]}
    >
      <InsideView
        // One view per building and brick it opens on: a link to another brick opens fresh on it
        // (reviewer runs 6 and 9).
        key={`${into.id}/${brick ?? ''}`}
        siteId={site.id}
        building={{ id: into.id, name: into.name, bricks: files.get(into.id)! }}
        blueprint={blueprint}
        screenFiles={[...screenFiles]}
        owners={Object.fromEntries(
          [...files].flatMap(([id, paths]) => paths.map((p) => [p, id] as const)),
        )}
        all={all}
        tables={tables}
        camera={cameraFrom(q, 'code', into.id)}
        member={member.name}
        initialBrick={brick}
        captured={captured}
        signedScreens={signedAt(site.repoDir, blueprint.commit)}
        screenStates={{
          tally: cp.states.tally,
          counts: [
            ...cp.states.counts.map((c) => c.sentence),
            ...(cp.states.unsaid ? [unsaidSentence(cp.states.unsaid)] : []),
          ],
        }}
        audit={audit}
        verdicts={audit?.verdicts ?? {}}
        flows={flows}
        flowScreens={flowScreens}
        tableFiles={Object.fromEntries((blueprint.tables ?? []).map((t) => [t.name, t.file]))}
      />
    </SiteShell>
  );
}
