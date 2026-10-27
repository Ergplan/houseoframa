// The trainer console (Stage 7), laid out as the journey of a build since Stage 11: across the top of a
// site's pages, the five acts as tabs (Idea, Build, Walk through, Audit, Hand over) and a small Care
// tab; under them only the current tab's actions, exactly one lit (the thing to do next in that act),
// each greyed with its reason when it cannot be done. The site in the three words stays in view. Care
// holds the work buttons with their last outcome, GitHub, the agenda and the key lights.
// Server-rendered: every button is a form, so it works without a script and nothing is typed but names.
import Link from 'next/link';
import type { Decision } from '@rama/shared';
import type { SecretView } from '@rama/db';
import { unsaidSentence, type Job, type SiteStates } from '@rama/workbench';
import { ACTS, type Act } from '../../app/api/site/[siteId]/act/handler';
import { JobSteps } from './JobSteps';
import { Chip, StateChip } from '../harmony/ui';
import { journeyTab, TABS, tabHref, type Tab } from './journey';

export interface ConsoleProps {
  siteId: string;
  name: string;
  kind: 'product' | 'outside';
  remote: string | null;
  states: SiteStates;
  cards: Decision[];
  keys: SecretView[] | null;
  jobs: { kind: string; job: Job; status: string }[];
  captured: boolean;
  /** Whether the site has an audit on record. */
  audited: boolean;
  /** Discovery sessions held for the site. */
  sessions: number;
}

const KEY_LABEL = {
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
  GITHUB_TOKEN: 'GitHub',
  GEMINI_API_KEY: 'Gemini',
  XAI_API_KEY: 'Grok',
  MOONSHOT_API_KEY: 'Kimi',
} as const;

function ActButton({
  siteId,
  act,
  why,
  primary,
}: {
  siteId: string;
  act: Act;
  why?: string | null;
  primary?: boolean;
}) {
  const def = ACTS[act];
  const off = why ?? (def.enabledBy ? `Comes with ${def.enabledBy}.` : null);
  return (
    <form action={`/api/site/${siteId}/act`} method="post" className="act">
      <input type="hidden" name="act" value={act} />
      <button
        type="submit"
        disabled={Boolean(off)}
        title={off ?? undefined}
        className={`eg-btn eg-btn--sm${primary && !off ? ' eg-btn--primary' : ''}`}
      >
        {def.label}
      </button>
      {off ? <small className="why">{off}</small> : null}
    </form>
  );
}

/**
 * The jobs' steps. In the journey bar a finished job folds to its last sentence, so the picture stays
 * under the tabs (Stage 11); a running one stays open, as it is the thing to watch.
 */
function Jobs({ jobs, fold }: { jobs: ConsoleProps['jobs']; fold?: boolean }) {
  return (
    <>
      {jobs.map(({ kind, job, status }) => (
        <div key={kind} className={`job ${status}`} data-job={kind}>
          {status === 'running' ? <meta httpEquiv="refresh" content="4" /> : null}
          {fold && status !== 'running' ? (
            <details className="job__fold">
              <summary>{job.steps.at(-1)?.sentence ?? 'Nothing has run yet.'}</summary>
              <JobSteps job={job} />
            </details>
          ) : (
            <JobSteps job={job} />
          )}
          {status === 'interrupted' ? (
            <small className="eg-muted">
              Interrupted when the app restarted; press the button again.
            </small>
          ) : null}
        </div>
      ))}
    </>
  );
}

/** The journey across the top of every page of a site: the tabs, the current tab's actions, the states. */
export function JourneyBar({ p, tab }: { p: ConsoleProps; tab: Tab }) {
  const j = journeyTab(p, tab);
  const inPage = j.actions.find((a) => a.inPage);
  return (
    <nav className="console journey" aria-label="The journey of the build" data-tab={tab}>
      <ol className="journey__tabs" role="tablist">
        {TABS.map((t) => (
          <li key={t.id} className={t.id === 'care' ? 'journey__care' : undefined}>
            <Link
              role="tab"
              aria-selected={t.id === tab}
              className={`journey__tab${t.id === tab ? ' on' : ''}`}
              href={tabHref(p.siteId, t.id)}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ol>
      <div className="journey__bar">
        <div className="journey__actions" data-actions={tab}>
          {j.actions
            .filter((a) => !a.inPage)
            .map((a) => (
              <ActButton
                key={a.act}
                siteId={p.siteId}
                act={a.act as Act}
                why={a.why}
                primary={j.lit === a.act}
              />
            ))}
          {inPage ? (
            <span className="eg-muted journey__inpage">
              {inPage.why ??
                (inPage.act === 'sign'
                  ? 'Sign each screen below, by name.'
                  : 'Hand over below, once nothing stands in the way.')}
            </span>
          ) : null}
        </div>
        <div className="rama-states" data-tally>
          <StateChip state="Verified" count={p.states.tally.Verified} />
          <StateChip state="Confirmed" count={p.states.tally.Confirmed} />
          <StateChip state="Unverified" count={p.states.tally.Unverified} />
          {p.states.figures ? (
            <span className="eg-muted">
              {p.states.figures.traced} of {p.states.figures.shown} figures on the screens traced.
            </span>
          ) : null}
        </div>
      </div>
      {tab === 'build' ? <Jobs fold jobs={p.jobs.filter((x) => x.kind === 'build')} /> : null}
      {tab === 'audit' ? <Jobs fold jobs={p.jobs.filter((x) => x.kind === 'audit')} /> : null}
    </nav>
  );
}

/** Care: the work buttons and their last outcome, GitHub, the agenda, the counts and the key lights. */
export function CarePanel({ p }: { p: ConsoleProps }) {
  const open = p.cards.filter((c) => c.status === 'open' || c.status === 'not-built');
  const unsigned = p.states.screens.filter((s) => s.audience === 'customer' && !s.state.confirmed);
  return (
    <div className="care eg-stack">
      <section className="eg-glass rama-card">
        <div className="eg-overline">Work</div>
        <Jobs jobs={p.jobs.filter((x) => x.kind !== 'build' && x.kind !== 'audit')} />
        {p.states.counts.map((c) => (
          <p key={c.audience} className="eg-muted" style={{ margin: 0 }}>
            {c.sentence}.
          </p>
        ))}
        {p.states.unsaid ? (
          <p className="eg-muted" style={{ margin: 0 }}>
            {unsaidSentence(p.states.unsaid)}.
          </p>
        ) : null}
      </section>
      {p.kind === 'product' ? (
        <section className="eg-glass rama-card">
          <div className="eg-overline">On GitHub</div>
          {p.remote ? (
            <p style={{ margin: 0 }}>
              <a href={p.remote}>{p.remote.replace('https://github.com/', '')}</a>
            </p>
          ) : (
            <form action={`/api/site/${p.siteId}/repository`} method="post" className="act">
              <button type="submit" className="eg-btn eg-btn--sm">
                Create it on GitHub
              </button>
              <small className="why">Under the GitHub account in Settings.</small>
            </form>
          )}
        </section>
      ) : null}
      <section className="eg-glass rama-card">
        <div className="eg-overline">Agenda</div>
        {open.length === 0 && unsigned.length === 0 ? (
          <p className="eg-muted" style={{ margin: 0 }}>
            Nothing open.
          </p>
        ) : (
          <ul className="agenda">
            {open.map((c) => (
              <li key={c.id}>
                Card: <Link href={`/site/${p.siteId}/discovery`}>{c.title}</Link> is{' '}
                {c.status === 'open' ? 'open' : 'decided but not built'}.
              </li>
            ))}
            {unsigned.map((s) => (
              <li key={s.id}>
                Screen {s.name} is not signed yet ({s.state.state}).
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="eg-glass rama-card">
        <div className="eg-overline">Keys</div>
        {p.keys ? (
          <div className="rama-states">
            {p.keys.map((k) => {
              const ok = k.set && k.check?.ok;
              const tone =
                !k.set || (k.check && !k.check.ok) ? 'negative' : ok ? 'positive' : 'muted';
              const word = !k.set
                ? 'missing'
                : k.check
                  ? k.check.ok
                    ? 'works'
                    : 'refused'
                  : 'not checked';
              return (
                <Chip key={k.name} tone={tone} title={k.check?.sentence}>
                  {KEY_LABEL[k.name]}: {word}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="eg-muted" style={{ margin: 0 }}>
            The key lights are the trainer’s.
          </p>
        )}
        <p style={{ margin: 0 }}>
          <Link href="/settings">Settings</Link>
        </p>
      </section>
    </div>
  );
}
