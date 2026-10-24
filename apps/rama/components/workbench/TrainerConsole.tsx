// The trainer console (Stage 7), in Harmony's Sidebar (design/harmony/README.md): the site in the three
// words, the acts of a session as buttons (greyed with the reason when not possible; one primary, the
// act possible now), the work buttons with their last outcome, the agenda and the key lights as chips.
// Server-rendered: every button is a form, so it works without a script and nothing is typed but names.
import Link from 'next/link';
import type { Decision } from '@rama/shared';
import type { SecretView } from '@rama/db';
import { unsaidSentence, type Job, type SiteStates } from '@rama/workbench';
import { ACTS, type Act } from '../../app/api/site/[siteId]/act/handler';
import { JobSteps } from './JobSteps';
import { Chip, StateChip } from '../harmony/ui';

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
}

const KEY_LABEL = {
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
  GITHUB_TOKEN: 'GitHub',
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
        className={`eg-btn eg-btn--block eg-btn--sm${primary && !off ? ' eg-btn--primary' : ''}`}
      >
        {def.label}
      </button>
      {off ? <small className="why">{off}</small> : null}
    </form>
  );
}

/** The act possible now, shown as the one primary: photograph, walk through, audit, then hand over. */
function nowAct(p: ConsoleProps): Act {
  if (!p.captured) return 'photograph';
  if (p.states.screens.some((s) => s.audience === 'customer' && !s.state.confirmed))
    return 'start-walkthrough';
  if (!p.audited) return 'call-audit';
  return 'hand-over';
}

export function TrainerConsole(p: ConsoleProps) {
  const open = p.cards.filter((c) => c.status === 'open' || c.status === 'not-built');
  const unsigned = p.states.screens.filter((s) => s.audience === 'customer' && !s.state.confirmed);
  const openai = p.keys?.find((k) => k.name === 'OPENAI_API_KEY');
  const noAuditor = !openai?.set ? 'Needs the OpenAI key in Settings.' : null;
  const now = nowAct(p);
  return (
    <div className="console eg-stack" aria-label="Trainer console">
      <div>
        <div className="eg-overline">Trainer console</div>
        <h2 className="eg-card__title">{p.name}</h2>
      </div>
      <div className="rama-states" data-tally>
        <StateChip state="Verified" count={p.states.tally.Verified} />
        <StateChip state="Confirmed" count={p.states.tally.Confirmed} />
        <StateChip state="Unverified" count={p.states.tally.Unverified} />
      </div>
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
      {p.states.figures ? (
        <p className="eg-muted" style={{ margin: 0 }}>
          {p.states.figures.traced} of {p.states.figures.shown} figures on the screens traced.
        </p>
      ) : null}

      <div className="eg-overline">The session</div>
      <ActButton siteId={p.siteId} act="start-session" />
      <ActButton siteId={p.siteId} act="close-ideation" />
      <ActButton siteId={p.siteId} act="start-build" />
      <ActButton siteId={p.siteId} act="pause-build" />
      <ActButton
        siteId={p.siteId}
        act="start-walkthrough"
        why={p.captured ? null : 'Photograph the screens first.'}
        primary={now === 'start-walkthrough'}
      />
      <ActButton
        siteId={p.siteId}
        act="call-audit"
        why={noAuditor}
        primary={now === 'call-audit'}
      />
      <ActButton siteId={p.siteId} act="hand-over" primary={now === 'hand-over'} />

      <div className="eg-overline">Work</div>
      <ActButton
        siteId={p.siteId}
        act="refresh"
        why={
          p.siteId === 'self' ? 'House of Rama redraws its own picture with every change.' : null
        }
      />
      <ActButton siteId={p.siteId} act="photograph" primary={now === 'photograph'} />
      <ActButton siteId={p.siteId} act="tests" />
      {p.jobs.map(({ kind, job, status }) => (
        <div key={kind} className={`job ${status}`} data-job={kind}>
          {status === 'running' ? <meta httpEquiv="refresh" content="4" /> : null}
          <JobSteps job={job} />
          {status === 'interrupted' ? (
            <small className="eg-muted">
              Interrupted when the app restarted; press the button again.
            </small>
          ) : null}
        </div>
      ))}

      {p.kind === 'product' ? (
        <>
          <div className="eg-overline">Repository</div>
          {p.remote ? (
            <p style={{ margin: 0 }}>
              <a href={p.remote}>{p.remote.replace('https://github.com/', '')}</a>
            </p>
          ) : (
            <form action={`/api/site/${p.siteId}/repository`} method="post" className="act">
              <button type="submit" className="eg-btn eg-btn--block eg-btn--sm">
                Create repository
              </button>
              <small className="why">Under the GitHub account in Settings.</small>
            </form>
          )}
        </>
      ) : null}

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
    </div>
  );
}
