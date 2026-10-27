'use client';
// Code written inside the glass (Stage 11), at the code level: the file's lines in JetBrains Mono, and
// beside every block the English pane: one or two plain sentences, drafted by the drafter and marked
// unconfirmed until a named person confirms them here, or "Not explained yet". While the builder works a
// lift, the file it is writing types in at its pace but never faster than a line can be read, deleted
// lines falling out first; "Catch up" jumps to now. Replay scrubs the file commit by commit, each change
// typed in from its diff, with the English as it stood at that commit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { typedAt, typingPlan, type TypedLine, type TypingPlan } from '@rama/stage';
import type { CodeView } from '@rama/workbench';

type Commit = { sha: string; at: string; subject: string; author: string };
type Edit = { at: number; lift: number; path: string; before: string | null; after: string | null };

const STATE_WORDS = {
  confirmed: (by: string) => `Confirmed by ${by}`,
  unconfirmed: 'Drafted, not confirmed',
} as const;

export function CodePane({
  siteId,
  path: startPath,
  member,
}: {
  siteId: string;
  path: string | null;
  member: string;
}) {
  const [path, setPath] = useState<string | null>(startPath);
  const [view, setView] = useState<CodeView | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [at, setAt] = useState<string | null>(null); // the commit shown; null = now
  const [plan, setPlan] = useState<TypingPlan | null>(null);
  const [clock, setClock] = useState(0);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<{ plan: TypingPlan }[]>([]);
  const seen = useRef(0);
  const started = useRef(0);

  const load = useCallback(
    async (p: string, commit: string | null) => {
      const q = new URLSearchParams({ path: p, ...(commit ? { commit } : {}) });
      const r = (await (await fetch(`/api/site/${siteId}/code?${q}`)).json()) as
        { ok: true; view: CodeView; commits: Commit[] } | { ok: false; sentence: string };
      if (!r.ok) {
        setError(r.sentence);
        return null;
      }
      setError(null);
      setView(r.view);
      setCommits(r.commits);
      return r.view;
    },
    [siteId],
  );

  useEffect(() => {
    if (path) void load(path, at);
  }, [path, at, load]);

  // In replay, the commit's change to the file types in.
  const replay = async (sha: string | null) => {
    setAt(sha);
    if (!sha || !path) {
      setPlan(null);
      return;
    }
    const v = await load(path, sha);
    if (v?.change) start(typingPlan({ path, before: v.change.before, after: v.change.after }));
  };

  const start = (p: TypingPlan) => {
    started.current = performance.now();
    setClock(0);
    setPlan(p);
  };

  // The clock of the typing.
  useEffect(() => {
    if (!plan) return;
    let raf = 0;
    const tick = () => {
      const ms = performance.now() - started.current;
      setClock(ms);
      if (ms < plan.total) raf = requestAnimationFrame(tick);
      else {
        // The next change in the queue, if the builder has made one; else the file as it stands, its
        // blocks with their English again (reviewer run 1).
        const next = queue.current.shift();
        if (next) start(next.plan);
        else {
          setPlan(null);
          if (path) void load(path, at);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan]);

  // Live: the builder's edits of the lift in hand, a second at a time, the latest file followed.
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const r = (await (
          await fetch(`/api/site/${siteId}/typing?since=${seen.current}`)
        ).json()) as {
          ok: boolean;
          building: boolean;
          edits: Edit[];
        };
        setLive(r.building);
        // Edits of a lift that has ended are history, read through the replay: only a running build
        // is followed as it types.
        if (!r.building) seen.current += r.edits.length;
        else if (r.edits.length) {
          seen.current += r.edits.length;
          let prev = 0;
          for (const e of r.edits) {
            const p = typingPlan(
              { path: e.path, before: e.before, after: e.after },
              Math.max(0, e.at - prev),
            );
            prev = e.at;
            if (!/\.tsx?$/.test(e.path)) continue;
            queue.current.push({ plan: p });
          }
          const last = r.edits.filter((e) => /\.tsx?$/.test(e.path)).at(-1);
          if (last) {
            setAt(null);
            setPath(last.path);
            if (!plan) {
              const next = queue.current.shift();
              if (next) start(next.plan);
            }
          }
        }
      } catch {
        // the server is busy: try again in a moment
      }
      if (!stop) setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [siteId]);

  const catchUp = () => {
    queue.current = [];
    setPlan(null);
    if (path) void load(path, at);
  };

  const typing: TypedLine[] | null = useMemo(
    () => (plan && plan.path === path ? typedAt(plan, clock) : null),
    [plan, path, clock],
  );
  const lines =
    typing ??
    (view
      ? view.source
          .replace(/\n$/, '')
          .split('\n')
          .map((t) => ({ text: t, shown: t, state: 'kept' as const, progress: 1 }))
      : []);

  const confirm = async (hash: string) => {
    const r = (await (
      await fetch(`/api/site/${siteId}/explain/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash }),
      })
    ).json()) as { ok: boolean; sentence?: string };
    if (!r.ok) setError(r.sentence ?? 'It could not be confirmed.');
    else if (path) void load(path, at);
  };

  if (!path)
    return (
      <section className="eg-glass rama-card code-pane" data-code-pane="empty">
        <p className="eg-muted" style={{ margin: 0 }}>
          {live
            ? 'The builder is at work; the file it writes opens here.'
            : 'Choose a part of the building to read its code and what it does.'}
        </p>
      </section>
    );

  // Lines grouped by block, as the file stands now (while typing, by the lines on screen so far).
  const blocks = view?.blocks ?? [];
  return (
    <section
      className="eg-glass rama-card code-pane"
      data-code-pane={path}
      data-typing={plan && clock < plan.total ? 'true' : 'false'}
    >
      <div className="code-pane__head rama-row">
        <b className="code-pane__path">{path}</b>
        {live ? (
          <span className="eg-chip eg-chip--accent">
            <span className="eg-dot eg-dot--live" aria-hidden /> The builder is writing
          </span>
        ) : null}
        {plan && clock < plan.total ? (
          <button type="button" className="eg-btn eg-btn--sm" onClick={catchUp}>
            Catch up
          </button>
        ) : null}
        {commits.length ? (
          <label className="code-pane__replay">
            <span className="eg-muted">Replay:</span>{' '}
            <select
              aria-label="Replay the file change by change"
              value={at ?? ''}
              onChange={(e) => void replay(e.target.value || null)}
            >
              <option value="">As it is now</option>
              {commits.map((c, i) => (
                <option key={c.sha} value={c.sha}>
                  Change {commits.length - i}: {c.subject}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {error ? <p className="voice-error">{error}</p> : null}
      <div className="code-pane__body">
        {(typing
          ? [
              {
                from: 1,
                to: lines.length,
                explanation: null,
                figures: [],
                hash: 'typing',
                kind: 'typing' as const,
                name: null,
              },
            ]
          : blocks
        ).map((b) => (
          <div className="code-block" key={`${b.hash}-${b.from}`} data-block={b.kind}>
            <pre className="code-block__lines">
              {lines.slice(b.from - 1, b.to).map((l, i) => (
                <div key={i} className={`code-line ${l.state}`} data-line={b.from + i}>
                  <span className="code-line__no">{b.from + i}</span>
                  <span>{l.shown || ' '}</span>
                  {l.state === 'typing' ? <span className="code-caret" aria-hidden /> : null}
                </div>
              ))}
            </pre>
            <aside
              className="code-block__english"
              data-explained={b.explanation?.state ?? 'typing'}
            >
              {!b.explanation ? (
                <span className="eg-muted">Being written.</span>
              ) : b.explanation.state === 'none' ? (
                <span className="eg-muted">Not explained yet</span>
              ) : (
                <>
                  <p style={{ margin: 0 }}>{b.explanation.sentence}</p>
                  {b.figures.map((f) =>
                    f.href ? (
                      <Link
                        key={f.id}
                        className="eg-chip eg-chip--accent code-figure"
                        href={f.href}
                      >
                        {f.title}: where it comes from
                      </Link>
                    ) : (
                      <span key={f.id} className="eg-chip">
                        {f.title}
                      </span>
                    ),
                  )}
                  <div className="rama-row">
                    <span
                      className={`eg-chip${b.explanation.state === 'confirmed' ? ' eg-chip--positive' : ''}`}
                    >
                      {b.explanation.state === 'confirmed'
                        ? STATE_WORDS.confirmed(b.explanation.by)
                        : STATE_WORDS.unconfirmed}
                    </span>
                    {b.explanation.state === 'unconfirmed' && !at ? (
                      <button
                        type="button"
                        className="eg-btn eg-btn--sm"
                        onClick={() => void confirm(b.hash)}
                      >
                        Confirm as {member}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </aside>
          </div>
        ))}
      </div>
    </section>
  );
}
