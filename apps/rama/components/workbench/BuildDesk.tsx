// The Build desk (Stage 12, at the member's word): three panes, as a code editor with its assistant is
// laid out. On the left what the customer asked for in the idea room (the decided cards) and what the
// builder did, lift by lift, as it happens; in the middle the lakefront the lifts raise; on the right
// the code as the builder writes it, with the English beside every block. The site's sidebar steps
// aside for the room.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Decision } from '@rama/shared';
import { CodePane } from '../lakefront/CodePane';
import { LiveJobs } from './LiveJobs';
import type { SiteJob } from '../../app/api/site/[siteId]/jobs/handler';

export function BuildDesk({
  siteId,
  member,
  idea,
  cards,
  jobs,
  file,
  children,
}: {
  siteId: string;
  member: string;
  idea: string | null;
  cards: Decision[];
  jobs: SiteJob[];
  /** The file the code pane opens on when no lift is being written. */
  file: string | null;
  children: ReactNode;
}) {
  const decided = cards.filter((c) => c.status === 'decided' || c.status === 'not-built');
  const build = jobs.some((j) => j.kind === 'build');
  return (
    <div className="desk" data-desk>
      <aside className="desk__brief" aria-label="What you asked for">
        <section className="eg-glass rama-card desk__pane">
          <h2 className="eg-card__title desk__head">What you asked for</h2>
          {idea ? <p className="desk__idea">{idea}</p> : null}
          {decided.length ? (
            <ol className="desk__cards">
              {decided.map((c) => (
                <li key={c.id}>
                  <b>{c.title}</b>
                  <p>{c.statement}</p>
                  <small className="eg-muted">Decided by {c.by}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="eg-muted">No card has a yes yet: agree the cards in the idea room.</p>
          )}
          <Link href={`/site/${siteId}/discovery`} className="desk__link">
            Open the idea room
          </Link>
        </section>
        <section className="eg-glass rama-card desk__pane" aria-label="What the builder did">
          <h2 className="eg-card__title desk__head">What the builder did</h2>
          {build ? (
            <LiveJobs fold siteId={siteId} jobs={jobs} kinds={['build']} />
          ) : (
            <p className="eg-muted">Nothing yet. Press Start build, and each lift shows here.</p>
          )}
        </section>
      </aside>
      <section className="desk__picture" aria-label="The lakefront">
        {children}
      </section>
      <aside className="desk__code" aria-label="The code being written">
        <CodePane siteId={siteId} path={file} member={member} />
      </aside>
    </div>
  );
}
