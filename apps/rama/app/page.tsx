import Link from 'next/link';
import { listSites } from '@rama/blueprint/site';
import { BuildStamp } from '../components/BuildStamp';
import { currentMember, siteIdsOf, withDb } from '../server/session';

export const dynamic = 'force-dynamic';

/** The front door: the product and its commit; a signed-in member's own sites, or the way to sign in. */
export default async function Home() {
  const member = await currentMember();
  const mine = member ? await withDb((db) => siteIdsOf(db, member)) : new Set<string>();
  const sites = listSites().filter((s) => mine.has(s.id));
  return (
    <main className="stub">
      <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>
        House of Rama · Built on trust
      </h1>
      <BuildStamp sha={process.env.GIT_SHA} />
      {!member ? (
        <p style={{ marginTop: '2rem' }}>
          <Link href="/login">Sign in</Link> to see your sites.
        </p>
      ) : (
        <>
          <p style={{ marginTop: '2rem' }}>
            Signed in as <b>{member.name}</b>
            {member.role === 'manager' ? (
              <>
                {' '}
                · <Link href="/campus">Campus</Link>
              </>
            ) : null}{' '}
            · <SignOut />
          </p>
          <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Your sites</h2>
          {sites.length ? (
            <ul className="sites">
              {sites.map((s) => (
                <li key={s.id}>
                  <Link href={`/site/${s.id}`}>{s.name}</Link>{' '}
                  <small style={{ color: 'var(--dim)' }}>/site/{s.id}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">No site belongs to you yet.</p>
          )}
          <p className="note">
            Add a site with <code>pnpm rama site add &lt;gitUrl|path&gt; --id &lt;id&gt;</code>: it
            is cloned read-only into <code>work/&lt;id&gt;/repo</code> and its Blueprint extracted.
          </p>
        </>
      )}
    </main>
  );
}

function SignOut() {
  return (
    <form action="/api/auth/logout" method="post" style={{ display: 'inline' }}>
      <button type="submit">Sign out</button>
    </form>
  );
}
