import { notFound } from 'next/navigation';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { SiteView } from '../../../components/site/SiteView';

export const dynamic = 'force-dynamic';

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = locateSite(siteId);
  if (!site) notFound();
  const blueprint = readSiteBlueprint(site);
  if (!blueprint) {
    return (
      <main className="stub">
        <h1>{site.name}</h1>
        <p>
          This site has no Blueprint yet. Run <code>pnpm rama site extract {site.id}</code>.
        </p>
      </main>
    );
  }
  return (
    <SiteView
      siteId={site.id}
      name={site.name}
      blueprint={blueprint}
      member={process.env.RAMA_MEMBER_NAME?.trim() || null}
    />
  );
}
