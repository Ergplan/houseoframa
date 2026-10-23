import Link from 'next/link';
import { pageSite, withDb } from '../../../../server/session';
import { handoverState } from '../../../../server/handover';
import { Action } from '../../../../components/floor/Action';

export const dynamic = 'force-dynamic';

/**
 * Handover (Stage 6): what stands between the site and its handover; then the structural certificate
 * (the load-bearing bricks, confirmed by a named person) and the keys page (where the code lives, how
 * it is deployed, how to ask for a change through the same ceremony).
 */
export default async function Handover({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await pageSite(siteId);
  const st = await withDb((db) => handoverState(db, site));
  if (!st) {
    return (
      <main className="stub">
        <h1>Handover · {site.name}</h1>
        <p>This site has no Blueprint yet.</p>
      </main>
    );
  }
  const api = `/api/site/${site.id}`;
  return (
    <main
      className="office"
      data-ready={st.readiness.ready}
      data-handed-over={Boolean(st.handover)}
    >
      <h1>Handover · {site.name}</h1>
      {st.handover ? (
        <section className="session" aria-label="Structural certificate">
          <h2>Structural certificate</h2>
          <p>
            Handed over by <b>{st.handover.person}</b> on {st.handover.at.slice(0, 10)} at{' '}
            <code>{st.handover.commit.slice(0, 7)}</code>, after its final signed audit (
            {st.audit?.vendor} {st.audit?.model}, report {st.handover.auditId.slice(0, 8)}).
          </p>
          <p>
            Load-bearing bricks, confirmed by {st.handover.structure.confirmedBy} on{' '}
            {st.handover.structure.confirmedAt.slice(0, 10)}: a change to one of these touches
            everything that imports it.
          </p>
          <ul>
            {st.handover.structure.bricks.map((b) => (
              <li key={b.path}>
                <code>{b.path}</code>, imported by {b.importedBy} bricks
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="session" aria-label="Readiness">
          <h2>Before handover</h2>
          {st.readiness.ready ? (
            <p>
              Every screen is signed, the audit of this commit is clean, and the structure is
              confirmed. <Action url={`${api}/handover`} label="Hand over" primary />
            </p>
          ) : (
            <ul data-reasons>
              {st.readiness.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <h3>
            Structure{' '}
            {st.structure ? (
              <span className="pill green">confirmed by {st.structure.confirmedBy}</span>
            ) : (
              <span className="pill amber">drafted from the Blueprint; unconfirmed</span>
            )}
          </h3>
          <p className="note">
            The bricks at least three others import, most first, as the Blueprint reads them at{' '}
            {st.bp.commit.slice(0, 7)}.
          </p>
          <ul>
            {st.draft.map((b) => (
              <li key={b.path}>
                <code>{b.path}</code>, imported by {b.importedBy}
              </li>
            ))}
          </ul>
          {!st.structure && (
            <Action
              url={`${api}/structure/confirm`}
              label="I have read these: confirm the structure"
            />
          )}
        </section>
      )}
      <section className="session" aria-label="Keys">
        <h2>Keys</h2>
        <dl className="kv">
          <dt>Code</dt>
          <dd>{st.bp.repo}</dd>
          <dt>Commit</dt>
          <dd>
            <code>{st.bp.commit.slice(0, 7)}</code>
          </dd>
          <dt>Deploy</dt>
          <dd>
            Not recorded in House of Rama: the deploy belongs to the site&apos;s own repository and
            its team.
          </dd>
          <dt>To ask for a change</dt>
          <dd>
            The same ceremony: a decision in the{' '}
            <Link href={`/site/${site.id}/discovery`}>site office</Link>, the build, the{' '}
            <Link href={`/site/${site.id}/walkthrough`}>walkthrough</Link> where a named person
            signs the screens it changed, the gate in CI, and the{' '}
            <Link href={`/site/${site.id}/audit`}>audit</Link>.
          </dd>
        </dl>
      </section>
      {st.handover && (
        <section className="session" aria-label="Check-ins">
          <h2>In use?</h2>
          <p>
            The campus counts products still in use 90 days after handover, from your check-ins.
          </p>
          <ul>
            {st.checkins.map((c) => (
              <li key={c.at}>
                {c.at.slice(0, 10)}: {c.inUse ? 'in use' : 'not in use'}
                {c.note ? `: ${c.note}` : ''}
              </li>
            ))}
          </ul>
          <Action url={`${api}/checkin`} body={{ inUse: true }} label="It is in use" />{' '}
          <Action url={`${api}/checkin`} body={{ inUse: false }} label="It is not in use" />
        </section>
      )}
      <p>
        <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
      </p>
    </main>
  );
}
