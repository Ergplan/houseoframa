import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture, showroomOf } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { ShowroomView } from '../../../../components/showroom/ShowroomView';
import { ActForm } from '../../../../components/workbench/ActForm';
import { SiteShell } from '../../../../components/workbench/SiteShell';

export const dynamic = 'force-dynamic';

async function ShowroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const q = (await searchParams) ?? {};
  const { site } = await pageSite(siteId);
  const capture = readCapture(site.id);
  const blueprint = readSiteBlueprint(site);
  if (!capture || !blueprint) {
    return (
      <main className="stub">
        <h1>Showroom · {site.name}</h1>
        <p>
          No screens have been photographed for this site yet, so there is nothing to show rather
          than a mock-up.
        </p>
        <ActForm siteId={site.id} act="photograph" label="Photograph the screens" />
        <Link href={`/site/${site.id}`}>Back to the Street</Link>
      </main>
    );
  }
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <ShowroomView
      siteId={site.id}
      name={site.name}
      showroom={showroomOf(capture, blueprint, signaturesInForce(readSignoffs(site.repoDir)))}
      initialScreen={one(q.screen)}
      initialFigure={one(q.figure)}
    />
  );
}

/** Showroom, in the site's chrome: the trainer console beside it (Stage 7, Harmony). */
export default async function Showroom(props: Parameters<typeof ShowroomPage>[0]) {
  const { siteId } = await props.params;
  const { member, site } = await pageSite(siteId);
  const q = ((await (
    props as { searchParams?: Promise<Record<string, string | string[] | undefined>> }
  ).searchParams) ?? {}) as Record<string, string | string[] | undefined>;
  return (
    <SiteShell site={site} member={member} here="Showroom" q={q}>
      {await ShowroomPage(props)}
    </SiteShell>
  );
}
