import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture, showroomOf } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { ShowroomView } from '../../../../components/showroom/ShowroomView';
import { ActForm } from '../../../../components/workbench/ActForm';

export const dynamic = 'force-dynamic';

export default async function Showroom({
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
        <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
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
