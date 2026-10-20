import Link from 'next/link';
import { listSites } from '@rama/blueprint/site';
import { BuildStamp } from '../components/BuildStamp';

export const dynamic = 'force-dynamic';

export default function Home() {
  const sites = listSites();
  return (
    <main className="stub">
      <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>
        House of Rama · Built on trust
      </h1>
      <BuildStamp sha={process.env.GIT_SHA} />
      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Sites</h2>
      <ul className="sites">
        {sites.map((s) => (
          <li key={s.id}>
            <Link href={`/site/${s.id}`}>{s.name}</Link>{' '}
            <small style={{ color: 'var(--dim)' }}>/site/{s.id}</small>
          </li>
        ))}
      </ul>
      <p className="note">
        Add a site with <code>pnpm rama site add &lt;gitUrl|path&gt; --id &lt;id&gt;</code>: it is
        cloned read-only into <code>work/&lt;id&gt;/repo</code> and its Blueprint extracted.
      </p>
    </main>
  );
}
