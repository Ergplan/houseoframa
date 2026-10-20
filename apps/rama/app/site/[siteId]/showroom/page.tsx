import Link from 'next/link';
import { notFound } from 'next/navigation';
import { locateSite } from '@rama/blueprint/site';

export default async function Showroom({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = locateSite(siteId);
  if (!site) notFound();
  return (
    <main className="stub">
      <h1>Showroom · {site.name}</h1>
      <p>
        Behind this door are the real screens of the built app, each with the bricks behind it.
        Screens are captured from the target&apos;s running app with Playwright in Stage 3; nothing
        is shown here until then, rather than a mock-up.
      </p>
      <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
    </main>
  );
}
