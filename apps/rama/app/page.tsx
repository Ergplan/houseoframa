import Link from 'next/link';
import { listSites, readSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import {
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

export const dynamic = 'force-dynamic';

/** A site in a list: its name, and its screens in the three words when it has a picture. */
function SiteRow({ site }: { site: SiteLocation }) {
  const bp = readSiteBlueprint(site);
  const st = bp && site.kind === 'product' ? siteStates(site, bp) : null;
  return (
    <li className="rama-row" style={{ justifyContent: 'space-between' }}>
      <Link href={`/site/${site.id}`}>{site.name}</Link>
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
      <div>
        <h1 className="eg-h1">House of Rama · Built on trust</h1>
        <BuildStamp sha={process.env.GIT_SHA} />
      </div>
      {!member ? (
        <Card>
          <p style={{ marginTop: 0 }}>Pick your name to see your products.</p>
          <ButtonLink href="/login" variant="primary">
            Who are you?
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Said q={q} />
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
                  <SiteRow key={s.id} site={s} />
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
