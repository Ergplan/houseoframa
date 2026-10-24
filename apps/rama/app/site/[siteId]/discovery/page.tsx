import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { createDb } from '@rama/db';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { listDecisions, listSessions, type SessionWithTurns } from '@rama/ceremony';
import type { Decision } from '@rama/shared';
import { DiscoveryView } from '../../../../components/ceremony/DiscoveryView';
import { SiteShell } from '../../../../components/workbench/SiteShell';

export const dynamic = 'force-dynamic';

async function DiscoveryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { member, site } = await pageSite(siteId);
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
      member={member.name}
      sessions={sessions}
      decisions={decisions}
      bricks={bp?.nodes.map((n) => n.path) ?? []}
      screens={bp?.screens.map((s) => s.id) ?? []}
    />
  );
}

/** Site office, in the site's chrome: the trainer console beside it (Stage 7, Harmony). */
export default async function Discovery(props: Parameters<typeof DiscoveryPage>[0]) {
  const { siteId } = await props.params;
  const { member, site } = await pageSite(siteId);
  const q = ((await (
    props as { searchParams?: Promise<Record<string, string | string[] | undefined>> }
  ).searchParams) ?? {}) as Record<string, string | string[] | undefined>;
  return (
    <SiteShell site={site} member={member} here="Site office" q={q}>
      {await DiscoveryPage(props)}
    </SiteShell>
  );
}
