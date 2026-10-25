import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { latestAudit, verifyReport } from '@rama/audit';
import { createDb } from '@rama/db';
import { ConfirmReport, DraftState } from '../../../../components/audit/ConfirmReport';
import { ActForm } from '../../../../components/workbench/ActForm';
import { SiteShell } from '../../../../components/workbench/SiteShell';

export const dynamic = 'force-dynamic';

const PILL = { pass: 'green', note: 'amber', defect: 'red' } as const;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The site's latest audit report, as signed: verified against the auditor's own model call on every view. */
async function AuditReportView({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { member, site } = await pageSite(siteId);
  let stored: Awaited<ReturnType<typeof latestAudit>>;
  let verified: { ok: boolean; why?: string } | null = null;
  try {
    const conn = createDb();
    try {
      stored = await latestAudit(conn.db, site.id);
      if (stored) verified = await verifyReport(conn.db, stored.report);
    } finally {
      await conn.close();
    }
  } catch (err) {
    return (
      <main className="stub">
        <h1>Audit · {site.name}</h1>
        <p>The audit reads from Postgres, which could not be reached ({(err as Error).message}).</p>
        <Link href={`/site/${site.id}`}>Back to the Street</Link>
      </main>
    );
  }
  if (!stored) {
    return (
      <main className="stub">
        <h1>Audit · {site.name}</h1>
        <p>
          No audit of this site yet: the checks, then the auditor, a different company from the
          builder.
        </p>
        <ActForm siteId={site.id} act="call-audit" label="Call the audit" />
        <Link href={`/site/${site.id}`}>Back to the Street</Link>
      </main>
    );
  }
  const { report, body } = stored;
  const flagged = stored.findings.filter((f) => f.verdict !== 'pass');
  const byCheck = new Map<string, typeof flagged>();
  for (const f of flagged) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
  return (
    <main className="office audit-report" data-report={report.reportId}>
      <h1>
        Audit report · {site.name} · <code>{stored.commit.slice(0, 7)}</code>
        {body.worktree ? ' + working tree' : ''}
      </h1>
      {body.byLine ? (
        <p className="byline" data-byline>
          {body.byLine}
        </p>
      ) : null}
      <p className="big" data-defects={body.counts.defects}>
        {plural(body.counts.defects, 'defect')}, {plural(body.counts.notes, 'note')},{' '}
        {plural(body.counts.passes, 'clean brick')} of {body.counts.bricks}.
      </p>
      <section className="session">
        <h2>Signature</h2>
        <p>
          Signed by <b>{report.vendor}</b> <code>{report.model}</code> on{' '}
          {report.at.replace('T', ' ').slice(0, 16)} UTC. Report <code>{report.reportId}</code>,
          model call <code>{report.callId}</code>.
        </p>
        <p>
          Inputs hash <code>{report.inputsHash}</code>:{' '}
          {verified?.ok ? (
            <span className="pill green" data-verified="true">
              verified against what the auditor received
            </span>
          ) : (
            <span className="pill red" data-verified="false">
              does not verify: {verified?.why}
            </span>
          )}
        </p>
      </section>
      <section className="session">
        <h2>Checks</h2>
        <ul>
          {body.runs.map((r) => (
            <li key={r.check}>
              <code>{r.check}</code>{' '}
              {r.ran ? (
                `ran (${r.detail})${r.outcome ? `: ${r.outcome}` : ''}`
              ) : (
                <b>not run: {r.detail}</b>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="session" data-section="drafted">
        <p>
          The narration, the alterations, the time machine and the auditor&apos;s reasons for
          lowering a verdict are its words, not the checks&apos;:{' '}
          <DraftState
            confirmations={stored.confirmations}
            by={`${report.vendor} ${report.model}`}
          />
        </p>
        {!stored.confirmations.length ? (
          <ConfirmReport siteId={site.id} reportId={report.reportId} member={member.name} />
        ) : null}
      </section>
      <section className="session">
        <h2>Narration</h2>
        {body.narration.map((n, i) => (
          <p key={i}>
            <b>{n.part}.</b> {n.text}
          </p>
        ))}
      </section>
      <section className="session">
        <h2>Sign-offs</h2>
        {body.signoffs.length === 0 ? (
          <p>None exist, so none can be confirmed or rejected.</p>
        ) : (
          <ul>
            {body.signoffs.map((s) => (
              <li key={s.screen}>
                <span className={`pill ${s.confirmed ? 'green' : 'red'}`}>
                  {s.confirmed ? 'Confirmed' : 'Rejected'}
                </span>{' '}
                {s.screen}, signed by {s.person} at <code>{s.commit.slice(0, 7)}</code>
                {s.defects.length ? `: defects in ${s.defects.join(', ')}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="session">
        <h2>Alterations and estimates</h2>
        <ul>
          {body.alterations.map((a, i) => (
            <li key={i}>
              {a.title}{' '}
              <small>
                (agent {a.agentTime} · {a.humanTime} · {a.kind})
              </small>
            </li>
          ))}
        </ul>
      </section>
      <section className="session">
        <h2>Time machine</h2>
        <ul>
          {body.timeMachine.map((t, i) => (
            <li key={i}>
              <code>{t.commit}</code> {t.what} <i>{t.shouldHave}</i>
            </li>
          ))}
        </ul>
      </section>
      <section className="session">
        <h2>Findings</h2>
        {[...byCheck].map(([check, fs]) => (
          <details key={check} open={fs.some((f) => f.verdict === 'defect')}>
            <summary>
              <code>{check}</code>: {fs.length}
            </summary>
            <ul>
              {fs.map((f, i) => (
                <li key={i}>
                  <span className={`pill ${PILL[f.verdict]}`}>{f.verdict}</span>{' '}
                  <Link href={`/site/${site.id}?brick=${encodeURIComponent(f.brick)}`}>
                    {f.brick}
                  </Link>
                  {f.line ? `:${f.line}` : ''} {f.text}
                  {f.auditorNote ? (
                    <small>
                      {' '}
                      (checks said {f.checkVerdict}; auditor: {f.auditorNote}){' '}
                      <DraftState
                        confirmations={stored.confirmations}
                        by={`${report.vendor} ${report.model}`}
                      />
                    </small>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      <p>
        <Link href={`/site/${site.id}`}>Back to the Street</Link>
      </p>
    </main>
  );
}

/** Audit, in the site's chrome: the trainer console beside it (Stage 7, Harmony). */
export default async function AuditReport(props: Parameters<typeof AuditReportView>[0]) {
  const { siteId } = await props.params;
  const { member, site } = await pageSite(siteId);
  const q = ((await (
    props as { searchParams?: Promise<Record<string, string | string[] | undefined>> }
  ).searchParams) ?? {}) as Record<string, string | string[] | undefined>;
  return (
    <SiteShell site={site} member={member} here="Audit" q={q}>
      {await AuditReportView(props)}
    </SiteShell>
  );
}
