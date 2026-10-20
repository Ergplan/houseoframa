import Link from 'next/link';
import { notFound } from 'next/navigation';
import { locateSite } from '@rama/blueprint/site';

export default async function Discovery({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = locateSite(siteId);
  if (!site) notFound();
  return (
    <main className="stub">
      <h1>Site office · {site.name}</h1>
      <p>
        The site office holds the discovery session: the decisions taken before and during the
        build, each tied to the bricks it produced. Decisions are recorded from Stage 4; until then
        the office is empty, rather than filled with reconstructed decisions.
      </p>
      <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
    </main>
  );
}
