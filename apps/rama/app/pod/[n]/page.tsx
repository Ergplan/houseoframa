import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember, withDb } from '../../../server/session';
import { podState } from '../../../server/floor';
import { TriptychView } from '../../../components/floor/TriptychView';

export const dynamic = 'force-dynamic';

/** A pod's screens: during the member's own work booking, its site's triptych; otherwise what the pod is doing. */
export default async function Pod({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const member = await requireMember();
  const pod = Number(n);
  const s = Number.isInteger(pod) && pod > 0 ? await withDb((db) => podState(db, pod)) : null;
  if (!s) notFound();
  const mine = s.booking?.personId === member.id;
  if (s.booking && mine && s.booking.shift === 'work' && s.site) {
    return (
      <TriptychView
        siteId={s.site.siteId}
        banner={`Pod ${s.pod} · ${s.site.name} · until ${s.booking.endsAt.slice(11, 16)} UTC · light ${s.light}`}
      />
    );
  }
  return (
    <main className="stub" data-light={s.light}>
      <h1>
        Pod {s.pod} · {s.name}
      </h1>
      {!s.booking ? (
        <p>
          Free now. <Link href="/book">Book it</Link>.
        </p>
      ) : s.booking.shift === 'game' ? (
        <p>Game mode until {s.booking.endsAt.slice(11, 16)} UTC.</p>
      ) : (
        <p>Booked by another member until {s.booking.endsAt.slice(11, 16)} UTC.</p>
      )}
      <Link href="/">◀ Home</Link>
    </main>
  );
}
