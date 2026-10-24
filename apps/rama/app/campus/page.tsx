import Link from 'next/link';
import { notFound } from 'next/navigation';
import { campusFigures } from '@rama/blueprint/metrics';
import { seesEverything } from '@rama/db';
import { requireMember, withDb } from '../../server/session';
import { campusInputs } from '../../server/campus';

export const dynamic = 'force-dynamic';

const LIGHT = { off: 'dim', blue: 'cyan', amber: 'amber', green: 'green', pink: 'red' } as const;

/** The floor manager's campus (Stage 6): every number is metrics.campusFigures over the records. */
export default async function Campus() {
  const member = await requireMember();
  if (!seesEverything(member)) notFound();
  const now = new Date();
  const { pods, sites } = await withDb((db) => campusInputs(db, now));
  const f = campusFigures(sites, now);
  return (
    <main className="office campus" data-sites={f.sites}>
      <h1>Campus</h1>
      <div className="stat">
        <div>
          <b data-figure="audits-passed">{f.auditsPassed}</b>
          <small>of {f.sites} sites audited clean at their commit</small>
        </div>
        <div>
          <b data-figure="in-use-90">
            {f.inUseAt90.inUse} / {f.inUseAt90.of}
          </b>
          <small>in use at 90 days (check-ins)</small>
        </div>
      </div>
      <section className="session">
        <h2>Pods</h2>
        {pods.length ? (
          <ul>
            {pods.map((p) => (
              <li key={p.pod} data-pod={p.pod} data-light={p.light}>
                <span className={`pill ${LIGHT[p.light]}`}>{p.light}</span> Pod {p.pod} · {p.name}:{' '}
                {!p.booking
                  ? 'free'
                  : p.booking.shift === 'game'
                    ? 'game mode'
                    : `${p.site?.name ?? p.booking.siteId}`}
                {p.booking ? `, until ${p.booking.endsAt.slice(11, 16)} UTC` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No pod is set up yet.</p>
        )}
      </section>
      <section className="session">
        <h2>Signatures pending</h2>
        {f.signaturesPending.length ? (
          <ul>
            {f.signaturesPending.map((p) => (
              <li key={p.person} data-pending={p.person}>
                {p.person}: {p.screens} screen{p.screens === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
      </section>
      <section className="session">
        <h2>Sites</h2>
        <ul>
          {sites.map((s) => (
            <li key={s.siteId}>
              {s.name} ({s.owner}): {s.unsignedScreens} unsigned,{' '}
              {s.auditPassed ? 'audit passed' : 'no clean audit at its commit'}
              {s.handedOverAt ? `, handed over ${s.handedOverAt.slice(0, 10)}` : ''}
            </li>
          ))}
        </ul>
      </section>
      <Link href="/">◀ Home</Link>
    </main>
  );
}
