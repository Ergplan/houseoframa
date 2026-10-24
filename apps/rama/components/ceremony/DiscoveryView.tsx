'use client';
// The site office: discovery sessions, turn by turn, and the decision cards they produced, each tied to
// the bricks it became. A member types (or dictates, where the browser can) a turn; Rama may draft the
// next question, shown as a draft; a card is recorded open and becomes decided only by a person's
// recorded yes (Stage 7). "Scrap everything" withdraws every card and starts a named draft.
// Layout ported from the weekend prototype's discovery overlay (reference/weekend-prototype/discovery.js).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Decision } from '@rama/shared';
import type { SessionWithTurns } from '@rama/ceremony';

type Recognition = {
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  start: () => void;
};

export function DiscoveryView({
  siteId,
  name,
  member,
  sessions,
  decisions,
  bricks,
  screens,
}: {
  siteId: string;
  name: string;
  member: string | null;
  sessions: SessionWithTurns[];
  decisions: Decision[];
  bricks: string[];
  screens: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [card, setCard] = useState({
    title: '',
    statement: '',
    status: 'open',
    bricks: '',
    screenId: '',
  });
  const [draftName, setDraftName] = useState('');
  const live = sessions.filter((s) => !s.reconstructed).at(-1) ?? null;
  const api = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/site/${siteId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = (await res.json()) as { ok: boolean; error?: string };
      if (!out.ok) setError(out.error ?? `HTTP ${res.status}`);
      else router.refresh();
      return out.ok;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const dictate = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setError('This browser cannot take dictation; type the turn instead.');
    const r = new Ctor();
    r.lang = 'en-IN';
    r.onresult = (e) => setText((t) => `${t} ${e.results[0]?.[0]?.transcript ?? ''}`.trim());
    r.start();
  };
  const bySession = (id: string) => decisions.filter((d) => d.sessionId === id);
  const loose = decisions.filter(
    (d) => !d.sessionId || !sessions.some((s) => s.id === d.sessionId),
  );

  return (
    <>
      <header className="hud">
        <h1>
          <Link href="/">HOUSE OF RAMA</Link>
        </h1>
        <span className="tag">Site office · {name}</span>
      </header>
      <p className="lede">
        <b>{decisions.filter((d) => d.status === 'decided').length}</b> decisions recorded,{' '}
        {decisions.filter((d) => d.status === 'open' || d.status === 'not-built').length} left open
        or not built
        {decisions.some((d) => d.status === 'withdrawn')
          ? `, ${decisions.filter((d) => d.status === 'withdrawn').length} withdrawn`
          : ''}
        . <Link href={`/site/${siteId}`}>◀ Back to the site</Link>
      </p>
      <div className="office">
        {member && decisions.some((d) => d.status !== 'withdrawn') && (
          <form
            className="scrap"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await api('decisions/scrap', { name: draftName })) setDraftName('');
            }}
          >
            <input
              placeholder="Name the new draft"
              aria-label="New draft"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button type="submit" disabled={busy || !draftName.trim()}>
              Scrap everything and start again
            </button>
            <small> Every card is withdrawn and kept; nothing is deleted.</small>
          </form>
        )}
        {sessions.length === 0 && decisions.length === 0 && (
          <p className="note">
            No session has been held or imported for this site yet. Nothing is shown that was not
            recorded.
          </p>
        )}
        {sessions.map((s) => (
          <section key={s.id} className="session" data-session={s.id}>
            <h2>
              {s.title}{' '}
              {s.reconstructed ? (
                <span className="pill amber">reconstructed</span>
              ) : (
                <span className="pill green">live record</span>
              )}
            </h2>
            {s.source && <p className="note">Imported from {s.source}.</p>}
            {s.turns.map((t) =>
              t.speaker === 'agenda' ? (
                <h3 key={t.id} className="topic">
                  <time dateTime={t.at}>
                    {t.at.slice(0, 10)} {t.at.slice(11, 16)} UTC
                  </time>{' '}
                  {t.text}
                </h3>
              ) : (
                <div
                  key={t.id}
                  className={`msg${t.speaker === 'Rama' ? ' agent' : ''}${t.draft ? ' draft' : ''}`}
                >
                  <b>{t.speaker}</b>
                  {t.draft && (
                    <span className="pill dim">
                      drafted by Rama, not asked until a person asks it
                    </span>
                  )}
                  <div>{t.text}</div>
                </div>
              ),
            )}
            {bySession(s.id).map((d) => (
              <Card
                yes={member ? (id) => api('decisions/yes', { id }) : null}
                key={d.id}
                d={d}
                siteId={siteId}
              />
            ))}
          </section>
        ))}
        {loose.length > 0 && (
          <section className="session">
            <h2>Decisions outside a session</h2>
            {loose.map((d) => (
              <Card
                yes={member ? (id) => api('decisions/yes', { id }) : null}
                key={d.id}
                d={d}
                siteId={siteId}
              />
            ))}
          </section>
        )}
        {!member ? (
          <p className="note">Sign in to record a session.</p>
        ) : !live ? (
          <p>
            <button
              disabled={busy}
              onClick={() =>
                api('discovery/sessions', {
                  title: `Discovery session, ${new Date().toISOString().slice(0, 10)}`,
                })
              }
            >
              Start a session
            </button>
          </p>
        ) : (
          <section className="session" aria-label="Record">
            <h2>
              Add to “{live.title}” as {member}
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await api('discovery/turns', { sessionId: live.id, text })) setText('');
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Turn"
                rows={3}
              />
              <p>
                <button type="submit" disabled={busy || !text.trim()}>
                  Add turn
                </button>{' '}
                <button type="button" onClick={dictate}>
                  🎙 Dictate
                </button>{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => api('discovery/ask', { sessionId: live.id })}
                >
                  Ask Rama for the next question
                </button>
              </p>
            </form>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await api('decisions', {
                  sessionId: live.id,
                  title: card.title,
                  statement: card.statement,
                  status: card.status,
                  bricks: card.bricks
                    .split(',')
                    .map((b) => b.trim())
                    .filter(Boolean),
                  ...(card.screenId ? { screenId: card.screenId } : {}),
                });
                if (ok)
                  setCard({
                    title: '',
                    statement: '',
                    status: 'open',
                    bricks: '',
                    screenId: '',
                  });
              }}
            >
              <h3>Record a decision card</h3>
              <input
                placeholder="Title"
                aria-label="Title"
                value={card.title}
                onChange={(e) => setCard({ ...card, title: e.target.value })}
              />
              <textarea
                placeholder="What was decided"
                aria-label="Statement"
                rows={2}
                value={card.statement}
                onChange={(e) => setCard({ ...card, statement: e.target.value })}
              />
              <select
                aria-label="Status"
                value={card.status}
                onChange={(e) => setCard({ ...card, status: e.target.value })}
              >
                <option value="open">Open</option>
                <option value="not-built">Not built</option>
              </select>
              <input
                list="office-bricks"
                placeholder="Bricks, comma separated"
                aria-label="Bricks"
                value={card.bricks}
                onChange={(e) => setCard({ ...card, bricks: e.target.value })}
              />
              <datalist id="office-bricks">
                {bricks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <select
                aria-label="Screen"
                value={card.screenId}
                onChange={(e) => setCard({ ...card, screenId: e.target.value })}
              >
                <option value="">No screen</option>
                {screens.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy || !card.title.trim() || !card.statement.trim()}>
                Record as {member}
              </button>
            </form>
          </section>
        )}
        {error && (
          <p className="red" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

const LABEL = {
  decided: 'Decision',
  open: 'Open',
  'not-built': 'Not built',
  withdrawn: 'Withdrawn',
};

function Card({
  d,
  siteId,
  yes,
}: {
  d: Decision;
  siteId: string;
  /** Records the signed-in person's yes; null when nobody is signed in. */
  yes: ((id: string) => Promise<boolean>) | null;
}) {
  const tone = d.status === 'decided' ? 'green' : d.status === 'withdrawn' ? 'dim' : 'red';
  return (
    <div className={`dec ${tone}`} data-decision={d.id}>
      <p>
        <span className={`pill ${tone}`}>{LABEL[d.status]}</span> <b>{d.title}</b>{' '}
        {d.reconstructed && <span className="pill amber">reconstructed</span>}
      </p>
      <p>{d.statement}</p>
      {yes && (d.status === 'open' || d.status === 'not-built') && (
        <p>
          <button type="button" className="primary" onClick={() => void yes(d.id)}>
            Yes, decided
          </button>
        </p>
      )}
      <p className="note">
        {d.by}, {d.at.slice(0, 10)}
        {d.screenId ? (
          <>
            {' '}
            · screen <code>{d.screenId}</code>
          </>
        ) : null}
      </p>
      {d.bricks.length > 0 && (
        <p>
          {d.bricks.map((b) => (
            <Link key={b} className="lnk" href={`/site/${siteId}?brick=${encodeURIComponent(b)}`}>
              {b}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}
