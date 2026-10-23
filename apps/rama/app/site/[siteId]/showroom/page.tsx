import Link from 'next/link';
import { notFound } from 'next/navigation';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture, showroomOf } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { ShowroomView } from '../../../../components/showroom/ShowroomView';

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
  const site = locateSite(siteId);
  if (!site) notFound();
  const capture = readCapture(site.id);
  const blueprint = readSiteBlueprint(site);
  if (!capture || !blueprint) {
    return (
      <main className="stub">
        <h1>Showroom · {site.name}</h1>
        <p>
          No screens have been captured for this site yet, so there is nothing to show rather than a
          mock-up. Add a <code>.rama/screens.json</code> to the target (docs/HOUSE-STYLE.md) and run{' '}
          <code>pnpm rama-trace capture {site.id}</code>.
        </p>
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
