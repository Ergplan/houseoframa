import Link from 'next/link';
import { listSites, readSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import {
  openCalls,
  isTestDriveSite,
  jobStatus,
  latestJob,
  latestTestDrive,
  siteStates,
} from '@rama/workbench';
import { BuildStamp } from '../components/BuildStamp';
import { Said } from '../components/workbench/Said';
import { Button, ButtonLink, Card, Folder, StateChip } from '../components/harmony/ui';
import { Shell } from '../components/harmony/Shell';
import { currentMember, siteIdsOf, withDb } from '../server/session';
import '../components/film/film.css';

export const dynamic = 'force-dynamic';

/** A site in a list: its name, and its screens in the three words when it has a picture. */
function SiteRow({ site, trainer }: { site: SiteLocation; trainer?: boolean }) {
  const bp = readSiteBlueprint(site);
  const st = bp && site.kind === 'product' ? siteStates(site, bp) : null;
  return (
    <li className="rama-row" style={{ justifyContent: 'space-between' }}>
      <span className="rama-row">
        <Link href={site.kind === 'product' ? `/film/${site.id}` : `/site/${site.id}`}>
          {site.name}
        </Link>
        {trainer && site.kind === 'product' ? (
          <Link href={`/site/${site.id}`} className="eg-muted" style={{ fontSize: 12 }}>
            Trainer view
          </Link>
        ) : null}
      </span>
      {st && st.screens.length ? (
        <span className="rama-row">
          <StateChip state="Verified" count={st.tally.Verified} />
          <StateChip state="Confirmed" count={st.tally.Confirmed} />
          <StateChip state="Unverified" count={st.tally.Unverified} />
        </span>
      ) : null}
    </li>
  );
}

/** The grey flags the builder could not get past by itself (Stage 13): each calls a trainer. */
function NeedsATrainer({ siteIds, names }: { siteIds: Set<string>; names: Map<string, string> }) {
  const calls = openCalls(null).filter((c) => siteIds.has(c.siteId));
  if (!calls.length) return null;
  return (
    <Card
      title="Needs a trainer"
      sub="The builder could not get past these by itself. The customer has been told you are coming."
    >
      <ul className="eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-calls>
        {calls.map((c) => (
          <li key={c.id} className="rama-row" style={{ justifyContent: 'space-between' }}>
            <span>
              <b>{names.get(c.siteId) ?? c.siteId}</b> · {c.sentence}
              {c.next ? <span className="eg-muted"> {c.next}</span> : null}
            </span>
            <Link href={`/site/${c.siteId}`}>Open the trainer view</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * A customer's front door (Stage 13): one sentence, and the products already made, each opening its film.
 * The product starts in the idea room, where the plan's steps are made with the drafter and said yes to.
 */
function Arena({
  name,
  products,
  outside,
  q,
}: {
  name: string;
  products: SiteLocation[];
  outside: SiteLocation[];
  q: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="arena">
      <Said q={q} />
      <div className="arena-hero">
        <div className="film-eyebrow">A new product</div>
        <h1 className="arena-h">
          Hello {name.split(' ')[0]}. <b>What shall we make</b> today?
        </h1>
        <p className="eg-muted">
          Say it in one sentence, the way you would to a colleague. It is turned into a plan, the
          plan is read back to you, and then you watch it built.
        </p>
        <form action="/api/products" method="post" className="arena-ask">
          <input
            className="arena-idea"
            name="idea"
            required
            maxLength={300}
            aria-label="What you want to make, in one sentence"
            placeholder="Something that reads my electricity bills and keeps the exact numbers in a database"
          />
          <input
            className="arena-name"
            name="name"
            required
            maxLength={80}
            aria-label="Its name"
            placeholder="Its name"
          />
          <button type="submit" className="film-btn lit">
            Make it
          </button>
        </form>
        <p className="eg-muted" style={{ fontSize: 13 }}>
          Or watch a whole build first: <Link href="/testdrive">Test drive</Link> builds a small
          sample product in a few minutes, as a film.
        </p>
      </div>
      {products.length ? (
        <Card
          title="Your products"
          sub="Each opens its film: the plan, the build, and the product running."
        >
          <ul className="sites eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {products.map((s) => (
              <SiteRow key={s.id} site={s} />
            ))}
          </ul>
        </Card>
      ) : null}
      {outside.length ? (
        <Card title="Outside sites" sub="Products built elsewhere that House of Rama only shows.">
          <ul className="sites eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {outside.map((s) => (
              <SiteRow key={s.id} site={s} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The front door: who you are, Test drive, a new product, and the products and outside sites you may
 * open. Nothing here is a command to type (rule 15).
 */
export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const q = (await searchParams) ?? {};
  const member = await currentMember();
  const mine = member ? await withDb((db) => siteIdsOf(db, member)) : new Set<string>();
  const sites = listSites().filter((s) => mine.has(s.id));
  // Every Test drive keeps its sample product; only the latest is listed.
  const lastDrive = latestTestDrive(sites.map((s) => s.id));
  const products = sites.filter(
    (s) => s.kind === 'product' && (!isTestDriveSite(s.id) || s.id === lastDrive),
  );
  const outside = sites.filter((s) => s.kind !== 'product');
  const drive = member ? latestJob('testdrive', null) : null;
  return (
    <Shell here="home" member={member} crumbs={[{ label: 'Home' }]}>
      {member?.role === 'customer' ? null : (
        <div>
          <h1 className="eg-h1">House of Rama · Built on trust</h1>
          <BuildStamp sha={process.env.GIT_SHA} />
        </div>
      )}
      {!member ? (
        <Card>
          <p style={{ marginTop: 0 }}>Pick your name to see your products.</p>
          <ButtonLink href="/login" variant="primary">
            Who are you?
          </ButtonLink>
        </Card>
      ) : member.role === 'customer' ? (
        <Arena name={member.name} products={products} outside={outside} q={q} />
      ) : (
        <>
          <Said q={q} />
          <NeedsATrainer
            siteIds={new Set(sites.map((s) => s.id))}
            names={new Map(sites.map((s) => [s.id, s.name]))}
          />
          <Folder
            title="Test drive"
            sub="The whole loop on the built-in sample product: idea, street, build, walkthrough, audit. No voice, no camera; about a minute. It says pass or fail in words."
            sheets={
              drive
                ? [
                    {
                      kicker: 'last run',
                      label: drive.startedAt.slice(0, 10),
                      value: jobStatus(drive),
                    },
                  ]
                : []
            }
          >
            <form action="/api/testdrive" method="post" className="rama-row">
              <Button type="submit">Test drive</Button>
              <Link href="/testdrive" style={{ color: 'inherit' }}>
                Last run
              </Link>
            </form>
          </Folder>

          <Card
            title="New product"
            sub="A name and the idea in one line; House of Rama sets up the rest."
          >
            <form action="/api/products" method="post" className="rama-form">
              <label className="eg-field">
                <span className="eg-field__label">Name</span>
                <input
                  className="eg-input"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="ergPLAN"
                />
              </label>
              <label className="eg-field">
                <span className="eg-field__label">The idea, in one line</span>
                <input
                  className="eg-input"
                  name="idea"
                  required
                  maxLength={300}
                  placeholder="What it does and for whom"
                />
              </label>
              <label className="eg-field">
                <span className="eg-field__label">GitHub repository name (optional)</span>
                <input
                  className="eg-input"
                  name="repository"
                  maxLength={100}
                  pattern="[A-Za-z0-9._\-]+"
                  placeholder="Empty: named after the product"
                />
              </label>
              <div>
                <Button type="submit" variant="primary">
                  Start the product
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Your products">
            {products.length ? (
              <ul className="sites eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {products.map((s) => (
                  <SiteRow key={s.id} site={s} trainer={member.role !== 'customer'} />
                ))}
              </ul>
            ) : (
              <p className="eg-muted" style={{ margin: 0 }}>
                No product yet. Start one above.
              </p>
            )}
          </Card>
          <Card title="Outside sites" sub="Products built elsewhere that House of Rama only shows.">
            {outside.length ? (
              <ul className="sites eg-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {outside.map((s) => (
                  <SiteRow key={s.id} site={s} />
                ))}
              </ul>
            ) : (
              <p className="eg-muted" style={{ margin: 0 }}>
                None yet.
              </p>
            )}
          </Card>
        </>
      )}
    </Shell>
  );
}
