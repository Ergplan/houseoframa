// The trainer console (Stage 7): a left-column panel on a site. The acts of a session as buttons, greyed
// when not possible with the reason; the work buttons with their last outcome; the agenda; the key
// lights; the site in the three words. Server-rendered: every button is a form, so it works without a
// script and nothing is typed but names.
import Link from 'next/link';
import type { Decision } from '@rama/shared';
import type { SecretView } from '@rama/db';
import type { Job, SiteStates } from '@rama/workbench';
import { ACTS, type Act } from '../../app/api/site/[siteId]/act/handler';
import { JobSteps } from './JobSteps';

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
}

const KEY_LABEL = {
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
  GITHUB_TOKEN: 'GitHub',
} as const;

function ActButton({ siteId, act, why }: { siteId: string; act: Act; why?: string | null }) {
  const def = ACTS[act];
  const off = why ?? (def.enabledBy ? `Comes with ${def.enabledBy}.` : null);
  return (
    <form action={`/api/site/${siteId}/act`} method="post" className="act">
      <input type="hidden" name="act" value={act} />
      <button type="submit" disabled={Boolean(off)} title={off ?? undefined}>
        {def.label}
      </button>
      {off ? <small className="why">{off}</small> : null}
    </form>
  );
}

export function TrainerConsole(p: ConsoleProps) {
  const open = p.cards.filter((c) => c.status === 'open' || c.status === 'not-built');
  const unsigned = p.states.screens.filter((s) => s.audience === 'customer' && !s.state.confirmed);
  const openai = p.keys?.find((k) => k.name === 'OPENAI_API_KEY');
  const noAuditor = !openai?.set ? 'Needs the OpenAI key in Settings.' : null;
  return (
    <aside className="console" aria-label="Trainer console">
      <h2>{p.name}</h2>
      <p className="three-words" data-tally>
        <span className="state verified">{p.states.tally.Verified} Verified</span>{' '}
        <span className="state confirmed">{p.states.tally.Confirmed} Confirmed</span>{' '}
        <span className="state unverified">{p.states.tally.Unverified} Unverified</span>
      </p>
      {p.states.counts.map((c) => (
        <p key={c.audience} className="note">
          {c.sentence}.
        </p>
      ))}
      {p.states.figures ? (
        <p className="note">
          {p.states.figures.traced} of {p.states.figures.shown} figures on the screens traced.
        </p>
      ) : null}

      <h3>The session</h3>
      <ActButton siteId={p.siteId} act="start-session" />
      <ActButton siteId={p.siteId} act="close-ideation" />
      <ActButton siteId={p.siteId} act="start-build" />
      <ActButton siteId={p.siteId} act="pause-build" />
      <ActButton
        siteId={p.siteId}
        act="start-walkthrough"
        why={p.captured ? null : 'Photograph the screens first.'}
      />
      <ActButton siteId={p.siteId} act="call-audit" why={noAuditor} />
      <ActButton siteId={p.siteId} act="hand-over" />

      <h3>Work</h3>
      <ActButton
        siteId={p.siteId}
        act="refresh"
        why={
          p.siteId === 'self' ? 'House of Rama redraws its own picture with every change.' : null
        }
      />
      <ActButton siteId={p.siteId} act="photograph" />
      <ActButton siteId={p.siteId} act="tests" />
      {p.jobs.map(({ kind, job, status }) => (
        <div key={kind} className={`job ${status}`} data-job={kind}>
          {status === 'running' ? <meta httpEquiv="refresh" content="4" /> : null}
          <JobSteps job={job} />
          {status === 'interrupted' ? (
            <small>Interrupted when the app restarted; press the button again.</small>
          ) : null}
        </div>
      ))}

      {p.kind === 'product' ? (
        <>
          <h3>Repository</h3>
          {p.remote ? (
            <p>
              <a href={p.remote}>{p.remote.replace('https://github.com/', '')}</a>
            </p>
          ) : (
            <form action={`/api/site/${p.siteId}/repository`} method="post">
              <button type="submit">Create repository</button>{' '}
              <small>Under the GitHub account in Settings.</small>
            </form>
          )}
        </>
      ) : null}

      <h3>Agenda</h3>
      {open.length === 0 && unsigned.length === 0 ? (
        <p className="note">Nothing open.</p>
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

      <h3>Keys</h3>
      {p.keys ? (
        <ul className="lights">
          {p.keys.map((k) => {
            const tone = !k.set ? 'red' : k.check ? (k.check.ok ? 'green' : 'red') : 'grey';
            return (
              <li key={k.name}>
                <span className={`light ${tone}`} aria-hidden /> {KEY_LABEL[k.name]}:{' '}
                {!k.set ? 'not entered' : k.check ? k.check.sentence : 'entered, not checked yet'}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="note">The key lights cannot be read right now.</p>
      )}
      <p>
        <Link href="/settings">Settings</Link>
      </p>
    </aside>
  );
}
