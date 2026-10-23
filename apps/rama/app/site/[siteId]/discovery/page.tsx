import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createDb } from '@rama/db';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { listDecisions, listSessions, type SessionWithTurns } from '@rama/ceremony';
import type { Decision } from '@rama/shared';
import { DiscoveryView } from '../../../../components/ceremony/DiscoveryView';

export const dynamic = 'force-dynamic';

export default async function Discovery({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = locateSite(siteId);
  if (!site) notFound();
  let sessions: SessionWithTurns[];
  let decisions: Decision[];
  try {
    const conn = createDb();
    try {
      [sessions, decisions] = await Promise.all([
        listSessions(conn.db, site.id),
        listDecisions(conn.db, site.id),
      ]);
    } finally {
      await conn.close();
    }
  } catch (err) {
    return (
      <main className="stub">
        <h1>Site office · {site.name}</h1>
        <p>
          The site office reads its sessions from Postgres, which could not be reached (
          {(err as Error).message}). Nothing is shown rather than a guess.
        </p>
        <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
      </main>
    );
  }
  const bp = readSiteBlueprint(site);
  return (
    <DiscoveryView
      siteId={site.id}
      name={site.name}
      member={process.env.RAMA_MEMBER_NAME?.trim() || null}
      sessions={sessions}
      decisions={decisions}
      bricks={bp?.nodes.map((n) => n.path) ?? []}
      screens={bp?.screens.map((s) => s.id) ?? []}
    />
  );
}
