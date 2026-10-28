import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { createDb, listSecrets } from '@rama/db';
import { readSiteBlueprint, siteRecord } from '@rama/blueprint/site';
import {
  currentDecisions,
  listDecisions,
  listSessions,
  type SessionWithTurns,
} from '@rama/ceremony';
import type { Decision } from '@rama/shared';
import { DiscoveryView } from '../../../../components/ceremony/DiscoveryView';
import { SiteShell } from '../../../../components/workbench/SiteShell';
import { BrainsForm } from '../../../../components/workbench/BrainsForm';
import { VENDOR_REGISTRY, vendorEntry } from '@rama/model';
import {
  BUILDER_OPTIONS,
  IDEA_SESSION,
  listIdeaFiles,
  readScratchpad,
  roomTurns,
  seatsOf,
  seatsSentence,
  type RoomTurn,
} from '@rama/workbench';
import { IdeaRoom } from '../../../../components/idea/IdeaRoom';

export const dynamic = 'force-dynamic';

async function DiscoveryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { member, site } = await pageSite(siteId);
  let sessions: SessionWithTurns[];
  let decisions: Decision[];
  let brains: Awaited<ReturnType<typeof seatsOf>>;
  let room: RoomTurn[];
  let keys: Awaited<ReturnType<typeof listSecrets>>;
  try {
    const conn = createDb();
    try {
      [sessions, decisions, brains, room, keys] = await Promise.all([
        listSessions(conn.db, site.id),
        listDecisions(conn.db, site.id),
        seatsOf(conn.db, site.id),
        roomTurns(conn.db, site.id).then((r) => r.turns),
        listSecrets(conn.db),
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
      sessions={sessions.filter((s) => s.title !== IDEA_SESSION)}
      decisions={decisions}
      bricks={bp?.nodes.map((n) => n.path) ?? []}
      screens={bp?.screens.map((s) => s.id) ?? []}
    />
  );
  if (site.kind !== 'product') return view;
  // The drafter answers in the idea room (Stage 12): its seat, its key, and whether it can search.
  const drafter = brains.seats.drafter;
  const vendor = drafter ? vendorEntry(drafter.vendor) : undefined;
  const key = vendor?.key ? keys.find((k) => k.name === vendor.key) : undefined;
  const noDrafter = !drafter
    ? 'No one holds the drafter seat yet: choose the brains below, and the drafter will answer here.'
    : vendor?.key && !key?.set
      ? `The drafter needs the ${vendor.label} key: a trainer enters it in Settings.`
      : null;
  const current = currentDecisions(decisions);
  const record = siteRecord(site.id);
  // A product's first question: its brains (Stage 9). The answer is a card like any other.
  return (
    <>
      <IdeaRoom
        siteId={site.id}
        name={site.name}
        idea={record?.idea ?? null}
        member={member.name}
        turns={room}
        files={listIdeaFiles(site)}
        scratchpad={readScratchpad(site)}
        decided={current
          .filter((d) => d.status === 'decided')
          .map((d) => ({ title: d.title, by: d.by }))}
        open={current.filter((d) => d.status === 'open').length}
        drafter={vendor ? `${vendor.label} (${drafter!.model})` : 'The drafter'}
        noSearch={
          vendor?.protocol === 'anthropic'
            ? null
            : 'Web search is wired for an Anthropic drafter only; choose one in the brains below.'
        }
        noDrafter={noDrafter}
      />
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
              primary={false}
            />
          </details>
        ) : (
          <BrainsForm
            action={`/api/site/${site.id}/brains`}
            seats={brains.seats}
            vendors={VENDOR_REGISTRY}
            builders={BUILDER_OPTIONS}
            submit="Yes, these brains"
            primary={false}
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
