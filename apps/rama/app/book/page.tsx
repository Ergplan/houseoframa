import Link from 'next/link';
import { listSites } from '@rama/blueprint/site';
import { requireMember, siteIdsOf, withDb } from '../../server/session';
import { allPods } from '../../server/floor';
import { BookForm } from '../../components/floor/BookForm';

export const dynamic = 'force-dynamic';

export default async function Book() {
  const member = await requireMember();
  const [pods, mine] = await withDb(
    async (db) => [await allPods(db), await siteIdsOf(db, member)] as const,
  );
  const sites = listSites()
    .filter((s) => mine.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));
  return (
    <main className="stub">
      <h1>Book a pod</h1>
      {pods.length ? (
        <BookForm pods={pods} sites={sites} />
      ) : (
        <p>No pod is set up yet (`pnpm rama-pod add &lt;n&gt; &lt;name&gt;`).</p>
      )}
      <Link href="/">◀ Home</Link>
    </main>
  );
}
