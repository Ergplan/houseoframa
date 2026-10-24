'use client';
// The walkthrough: screen by screen, the real screenshot, what it is asked to show (the traced figures
// and the decided cards about it), read aloud by the browser's SpeechSynthesis, and a Confirm that signs
// the screen under the local member's name at the commit it was captured from. Nothing is signed for
// anyone: the button is the person's own act, and the signature names them.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WalkthroughStep } from '@rama/ceremony/walkthrough';

export function WalkthroughView({
  siteId,
  name,
  commit,
  member,
  steps,
}: {
  siteId: string;
  name: string;
  commit: string;
  member: string | null;
  steps: WalkthroughStep[];
}) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [view, setView] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Screens the member passed over in this sitting (Not yet): shown as such in the strip, never stored.
  const [notYet, setNotYet] = useState<Set<string>>(new Set());
  const step = steps[Math.min(at, steps.length - 1)];
  const signed = steps.filter((s) => s.signature).length;

  const go = (i: number) => {
    setAt(i);
    setView(0);
    setError(null);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  };
  const speak = (text: string) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return setError('This browser cannot read aloud.');
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  };
  const post = async (withdraw: boolean) => {
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/site/${siteId}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          screenId: step.screenId,
          commit,
          statement: withdraw ? `Withdrawn: ${step.statement}` : step.statement,
          ...(withdraw ? { withdraw: true } : {}),
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) setError(body.error ?? `HTTP ${res.status}`);
      else router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shot = step?.views[view];
  return (
    <>
      <header className="hud">
        <h1>
          <Link href="/">HOUSE OF RAMA</Link>
        </h1>
        <span className="tag">Walkthrough · {name}</span>
        <span className="site">screens captured at {commit.slice(0, 7)}</span>
      </header>
      <p className="lede">
        <b>
          {signed} of {steps.length}
        </b>{' '}
        screens signed at this commit. <Link href={`/site/${siteId}`}>◀ Back to the site</Link> ·{' '}
        <Link href={`/site/${siteId}/showroom`}>Showroom</Link>
      </p>
      {!step ? (
        <p className="note">
          No captured screen maps to a screen of the Blueprint, so there is nothing to sign.
        </p>
      ) : (
        <div className="cab">
          <div style={{ minWidth: 0 }}>
            <div className="shotbar">
              <h4>
                {at + 1} / {steps.length} · {step.screenId}
              </h4>
              <span className="real">real screen</span>
              {step.views.length > 1 &&
                step.views.map((v, i) => (
                  <button
                    key={v.name}
                    className={i === view ? 'on' : ''}
                    onClick={() => setView(i)}
                  >
                    {v.title}
                  </button>
                ))}
            </div>
            {shot && (
              <div className="shotview">
                {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot, served as is */}
                <img
                  src={`/api/site/${siteId}/shots/${shot.shot}`}
                  alt={`${shot.title}, as the target's app shows it`}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div className="strip" aria-label="Screens to sign">
              {steps.map((s, i) => (
                <button
                  key={s.screenId}
                  className={i === at ? 'on' : ''}
                  onClick={() => go(i)}
                  data-signed={Boolean(s.signature)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot thumbnail */}
                  <img src={`/api/site/${siteId}/shots/${s.views[0]!.shot}`} alt="" />
                  <span>
                    {s.signature ? '● ' : notYet.has(s.screenId) ? '◌ not yet · ' : '○ '}
                    {s.screenId}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <aside className="mon" aria-live="polite" data-screen={step.screenId}>
            <h2>{step.screenId}</h2>
            {step.signature ? (
              <p className="big" data-state="signed">
                Signed by {step.signature.person} on {step.signature.at.slice(0, 10)}.
              </p>
            ) : step.staleSignature ? (
              <p className="big red" data-state="stale">
                Signed by {step.staleSignature.person} at{' '}
                {step.staleSignature.target.commit.slice(0, 7)}, not at this commit: it needs
                signing again.
              </p>
            ) : (
              <p className="big red" data-state="unsigned">
                Not signed at this commit.
              </p>
            )}
            <h3>The statement you sign</h3>
            <blockquote data-statement>{step.statement}</blockquote>
            <button onClick={() => speak(step.statement)}>▶ Read aloud</button>
            {step.figures.length > 0 && (
              <>
                <h3>Traced figures on it</h3>
                <ul>
                  {step.figures.map((f) => (
                    <li key={f.key}>
                      <Link
                        href={`/site/${siteId}/showroom?screen=${f.key.split('/')[0]}&figure=${f.key}`}
                      >
                        {f.title}
                      </Link>
                      : {f.shown ?? 'not read'}{' '}
                      {f.matches === true ? (
                        <span className="pill green">re-executed, matches</span>
                      ) : f.matches === false ? (
                        <span className="pill red">re-executed, differs</span>
                      ) : (
                        <span className="pill dim">not re-executed</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {step.decisions.length > 0 && (
              <>
                <h3>Decisions about it</h3>
                <ul>
                  {step.decisions.map((d) => (
                    <li key={d.id}>
                      <b>{d.title}</b>
                      {d.reconstructed ? (
                        <span className="pill amber">reconstructed</span>
                      ) : null}: {d.statement}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {member ? (
              <>
                <p>
                  <button disabled={busy || Boolean(step.signature)} onClick={() => post(false)}>
                    {step.signature ? 'Signed' : `Confirm and sign as ${member}`}
                  </button>{' '}
                  {step.signature && (
                    <button disabled={busy} onClick={() => post(true)}>
                      Withdraw my signature
                    </button>
                  )}{' '}
                  {!step.signature && (
                    <button
                      onClick={() => {
                        setNotYet((n) => new Set(n).add(step.screenId));
                        if (at + 1 < steps.length) go(at + 1);
                      }}
                    >
                      Not yet
                    </button>
                  )}{' '}
                  {at + 1 < steps.length && (
                    <button onClick={() => go(at + 1)}>Next screen ▶</button>
                  )}
                </p>
                <p className="note">
                  Not yet signs nothing and records nothing: the screen stays unsigned, and the gate
                  keeps it out.
                </p>
              </>
            ) : (
              <p className="note">
                Nobody is signed in, so there is nobody to sign as. Pick your name first.
              </p>
            )}
            {error && (
              <p className="red" role="alert">
                {error}
              </p>
            )}
            <p className="note">
              Signing writes a named, dated, append-only record (in Postgres and in the
              target&apos;s <code>.rama/signoffs.jsonl</code>). A withdrawal is a new record;
              nothing is erased.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
