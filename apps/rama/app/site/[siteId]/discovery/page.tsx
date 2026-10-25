import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { createDb } from '@rama/db';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { listDecisions, listSessions, type SessionWithTurns } from '@rama/ceremony';
import type { Decision } from '@rama/shared';
import { DiscoveryView } from '../../../../components/ceremony/DiscoveryView';
import { SiteShell } from '../../../../components/workbench/SiteShell';
import { BrainsForm } from '../../../../components/workbench/BrainsForm';
import { VENDOR_REGISTRY } from '@rama/model';
import { BUILDER_OPTIONS, seatsOf, seatsSentence } from '@rama/workbench';

export const dynamic = 'force-dynamic';

async function DiscoveryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { member, site } = await pageSite(siteId);
  let sessions: SessionWithTurns[];
  let decisions: Decision[];
  let brains: Awaited<ReturnType<typeof seatsOf>>;
  try {
    const conn = createDb();
    try {
      [sessions, decisions, brains] = await Promise.all([
        listSessions(conn.db, site.id),
        listDecisions(conn.db, site.id),
        seatsOf(conn.db, site.id),
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
        <Link href={`/site/${site.id}`}>Back to the Street</Link>
      </main>
    );
  }
  const bp = readSiteBlueprint(site);
  const view = (
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
  if (site.kind !== 'product') return view;
  // A product's first question: its brains (Stage 9). The answer is a card like any other.
  return (
    <>
      <section className="eg-card brains-ask" data-brains-ask={brains.from}>
        <h2 className="eg-card__title">Which brains will build, check and speak?</h2>
        <p className="eg-muted">
          {brains.from === 'product'
            ? `Chosen for ${site.name}: ${seatsSentence(brains.seats)}.`
            : `Not chosen for ${site.name} yet; until it is, ${seatsSentence(brains.seats)} (${brains.from === 'settings' ? 'from Settings' : 'from the server’s setup file'}).`}{' '}
          The answer is a card like any other, decided by the person who gives it.
        </p>
        {brains.from === 'product' ? (
          <details>
            <summary>Change the brains</summary>
            <BrainsForm
              action={`/api/site/${site.id}/brains`}
              seats={brains.seats}
              vendors={VENDOR_REGISTRY}
              builders={BUILDER_OPTIONS}
              submit="Yes, these brains"
            />
          </details>
        ) : (
          <BrainsForm
            action={`/api/site/${site.id}/brains`}
            seats={brains.seats}
            vendors={VENDOR_REGISTRY}
            builders={BUILDER_OPTIONS}
            submit="Yes, these brains"
          />
        )}
      </section>
      {view}
    </>
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
