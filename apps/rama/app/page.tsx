import Link from 'next/link';
import { listSites } from '@rama/blueprint/site';
import { seesEverything } from '@rama/db';
import { BuildStamp } from '../components/BuildStamp';
import { Said } from '../components/workbench/Said';
import { currentMember, siteIdsOf, withDb } from '../server/session';

export const dynamic = 'force-dynamic';

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
  const products = sites.filter((s) => s.kind === 'product');
  const outside = sites.filter((s) => s.kind !== 'product');
  return (
    <main className="stub workbench">
      <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>
        House of Rama · Built on trust
      </h1>
      <BuildStamp sha={process.env.GIT_SHA} />
      {!member ? (
        <p style={{ marginTop: '2rem' }}>
          <Link href="/login" className="button primary">
            Who are you?
          </Link>{' '}
          Pick your name to see your products.
        </p>
      ) : (
        <>
          {/* A div, not a p: the form inside would end a p early and break hydration. */}
          <div className="whoami">
            You are <b>{member.name}</b>
            {seesEverything(member) ? (
              <>
                {' '}
                · <Link href="/settings">Settings</Link> · <Link href="/campus">Campus</Link>
              </>
            ) : null}{' '}
            · <SignOut />
          </div>
          <Said q={q} />

          <section className="testdrive-call">
            <h2>Test drive</h2>
            <p className="note">
              Runs the whole loop on the built-in sample product: idea, street, build, walkthrough,
              audit. No voice, no camera; a few minutes. It says pass or fail in words.
            </p>
            <form action="/api/testdrive" method="post">
              <button type="submit" className="primary big">
                Test drive
              </button>{' '}
              <Link href="/testdrive">Last run</Link>
            </form>
          </section>

          <section>
            <h2>New product</h2>
            <form action="/api/products" method="post" className="stack">
              <label>
                Name <input name="name" required maxLength={80} placeholder="ergPLAN" />
              </label>
              <label>
                The idea, in one line{' '}
                <input
                  name="idea"
                  required
                  maxLength={300}
                  placeholder="What it does and for whom"
                />
              </label>
              <button type="submit" className="primary">
                Start the product
              </button>
            </form>
          </section>

          <h2>Your products</h2>
          {products.length ? (
            <ul className="sites">
              {products.map((s) => (
                <li key={s.id}>
                  <Link href={`/site/${s.id}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">No product yet. Start one above.</p>
          )}
          <h2>Outside sites</h2>
          <p className="note">Products built elsewhere that House of Rama only shows.</p>
          {outside.length ? (
            <ul className="sites">
              {outside.map((s) => (
                <li key={s.id}>
                  <Link href={`/site/${s.id}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">None yet.</p>
          )}
        </>
      )}
    </main>
  );
}

function SignOut() {
  return (
    <form action="/api/auth/logout" method="post" style={{ display: 'inline' }}>
      <button type="submit">Not you? Switch</button>
    </form>
  );
}
