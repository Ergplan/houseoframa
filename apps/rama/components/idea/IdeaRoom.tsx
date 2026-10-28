'use client';
// The idea room (Stage 12): the first room of a product, laid out like a chat with a colleague. The
// conversation fills the middle, the composer sits under it (files, a web search, send), and the room's
// files, scratchpad and cards stand beside it. The drafter's replies are drafts: each says so, shows
// the pages its search read, and offers the cards it proposes for a person's yes.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface RoomTurnView {
  id: string;
  speaker: string;
  text: string;
  draft: boolean;
  at: string;
  meta?: {
    files?: string[];
    sources?: { url: string; title: string }[];
    cards?: { title: string; statement: string }[];
  };
}

export interface RoomFileView {
  name: string;
  bytes: number;
  kind: 'pdf' | 'image' | 'text' | 'other';
  addedBy: string | null;
  addedAt: string | null;
}

export interface IdeaRoomProps {
  siteId: string;
  name: string;
  idea: string | null;
  member: string;
  turns: RoomTurnView[];
  files: RoomFileView[];
  scratchpad: { text: string; savedBy: string | null; savedAt: string | null };
  /** Titles of the cards already written, so a proposal already decided shows as decided. */
  decided: { title: string; by: string }[];
  open: number;
  drafter: string;
  /** Why a web search cannot be offered, or null when it can. */
  noSearch: string | null;
  /** Why the drafter cannot answer (no key), or null when it can. */
  noDrafter: string | null;
}

const DRAFTER = 'Drafter';

const STARTERS = [
  'Here is the idea as I see it today…',
  'The people who will use it are…',
  'The numbers it should work out for me are…',
  'Something it should never do is…',
];

const size = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : n >= 1024
      ? `${Math.round(n / 1024)} KB`
      : `${n} bytes`;

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Simple Markdown, drawn as React (never as HTML): paragraphs, lists, **bold** and `code`. */
export function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string, key: string): ReactNode[] =>
    s
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
        ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      );
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]!);
          const items = lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''), `${i}-${j}`)}</li>
          ));
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        const heading = /^#{1,4}\s+(.*)$/.exec(b);
        if (heading && lines.length === 1) return <h4 key={i}>{inline(heading[1]!, String(i))}</h4>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j ? <br /> : null}
                {inline(l, `${i}-${j}`)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function IdeaRoom(p: IdeaRoomProps) {
  const router = useRouter();
  const [turns, setTurns] = useState(p.turns);
  const [files, setFiles] = useState(p.files);
  const [text, setText] = useState('');
  const [attached, setAttached] = useState<string[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pad, setPad] = useState(p.scratchpad.text);
  const [padSaved, setPadSaved] = useState(p.scratchpad);
  const [decided, setDecided] = useState(p.decided);
  /** The voice is on in this room: what is typed goes through it, so the reply is read aloud too. */
  const [voiceOn, setVoiceOn] = useState(false);
  const list = useRef<HTMLDivElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  // The voice in the room (Stage 12): the turns it carries are shown here, as typed ones are.
  useEffect(() => {
    const state = (e: Event) => setVoiceOn(Boolean((e as CustomEvent<{ on: boolean }>).detail?.on));
    const asking = (e: Event) => {
      const d = (e as CustomEvent<{ speaker: string; text: string; files?: string[] }>).detail;
      setTurns((t) => [
        ...t,
        {
          id: `local-${Date.now()}`,
          speaker: d.speaker,
          text: d.text,
          draft: false,
          at: new Date().toISOString(),
          ...(d.files?.length ? { meta: { files: d.files } } : {}),
        },
      ]);
      setNote(null);
      setThinking(true);
    };
    const answered = (e: Event) => {
      const d = (e as CustomEvent<{ turn?: RoomTurnView; error?: string }>).detail;
      if (d.turn) setTurns((t) => [...t, d.turn!]);
      else setNote(d.error ?? 'The drafter could not answer.');
      setThinking(false);
    };
    window.addEventListener('rama:voice-state', state);
    window.addEventListener('rama:idea-asking', asking);
    window.addEventListener('rama:idea-turn', answered);
    window.dispatchEvent(new CustomEvent('rama:voice-ask-state'));
    return () => {
      window.removeEventListener('rama:voice-state', state);
      window.removeEventListener('rama:idea-asking', asking);
      window.removeEventListener('rama:idea-turn', answered);
    };
  }, []);

  const decidedTitles = useMemo(() => new Map(decided.map((d) => [d.title, d.by])), [decided]);

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`/api/site/${p.siteId}/idea/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown> & { ok: boolean; sentence?: string };
  };

  const upload = async (list: FileList | File[]) => {
    const chosen = [...list];
    if (!chosen.length) return;
    setUploading(true);
    setNote(null);
    const form = new FormData();
    for (const f of chosen) form.append('file', f);
    try {
      const res = await fetch(`/api/site/${p.siteId}/idea/files`, { method: 'POST', body: form });
      const r = (await res.json()) as { ok: boolean; files?: RoomFileView[]; sentence?: string };
      if (r.files?.length) {
        setFiles((fs) => [
          ...r.files!,
          ...fs.filter((f) => !r.files!.some((n) => n.name === f.name)),
        ]);
        setAttached((a) => [...new Set([...a, ...r.files!.map((f) => f.name)])]);
      }
      if (r.sentence) setNote(r.sentence);
    } catch (err) {
      setNote(`The file could not be sent: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const send = async (words = text) => {
    const message = words.trim();
    if (!message || thinking) return;
    if (voiceOn) {
      // The voice carries it: the room shows the turn and the reply when it comes, and the voice reads it.
      window.dispatchEvent(
        new CustomEvent('rama:voice-say', {
          detail: { text: message, files: attached, webSearch },
        }),
      );
      setText('');
      setAttached([]);
      return;
    }
    const mine: RoomTurnView = {
      id: `local-${Date.now()}`,
      speaker: p.member,
      text: message,
      draft: false,
      at: new Date().toISOString(),
      ...(attached.length ? { meta: { files: attached } } : {}),
    };
    setTurns((t) => [...t, mine]);
    setText('');
    setNote(null);
    setThinking(true);
    const sent = attached;
    setAttached([]);
    try {
      const r = await post('ask', { text: message, files: sent, webSearch });
      if (r.ok && r.turn) setTurns((t) => [...t, r.turn as RoomTurnView]);
      else setNote(r.sentence ?? 'The drafter could not answer.');
    } catch (err) {
      setNote(`The drafter could not answer: ${(err as Error).message}`);
    } finally {
      setThinking(false);
      box.current?.focus();
    }
  };

  const agree = async (card: { title: string; statement: string }) => {
    const r = await post('agree', card);
    if (r.ok) {
      setDecided((d) => [...d, { title: card.title, by: p.member }]);
      router.refresh();
    } else setNote(r.sentence ?? 'The card could not be written.');
  };

  const savePad = async () => {
    if (pad === padSaved.text) return;
    const r = await post('scratchpad', { text: pad });
    if (r.ok) setPadSaved({ text: pad, savedBy: p.member, savedAt: new Date().toISOString() });
    else setNote(r.sentence ?? 'The scratchpad could not be saved.');
  };

  return (
    <section
      className={`idea-room${dragging ? ' idea-room--drop' : ''}`}
      aria-label="The idea room"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="idea-room__main">
        <header className="idea-room__head">
          <div>
            <h1 className="idea-room__title">The idea room</h1>
            <p className="eg-muted">
              {p.name}
              {p.idea ? ` · ${p.idea}` : ''}
            </p>
          </div>
          <div className="rama-row">
            <span className="eg-chip" title="Who answers in this room">
              {p.drafter} answers here
            </span>
            {voiceOn ? (
              <span className="eg-chip eg-chip--accent">
                The voice is on: hold to talk below, or write here
              </span>
            ) : (
              <button
                type="button"
                className="eg-btn eg-btn--sm"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('rama:voice-start', { detail: { idea: true } }),
                  )
                }
              >
                Talk with the voice
              </button>
            )}
          </div>
        </header>

        <div className="idea-room__talk" ref={list} data-testid="idea-talk">
          {turns.length === 0 ? (
            <div className="idea-room__welcome">
              <h2>Welcome, {firstName(p.member)}.</h2>
              <p>
                This is where {p.name} starts. Tell me about it in your own words: what it should
                do, who it is for, and what a good day with it looks like. Rough is perfect; we will
                shape it together.
              </p>
              <p className="eg-muted">
                Drop in anything that helps: a bill, a tariff order, a load profile, a photo of a
                whiteboard. I can look things up on the web too. Nothing is decided until you say
                yes to it.
              </p>
              <div className="idea-room__starters">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="eg-chip"
                    onClick={() => {
                      setText(s.replace(/…$/, ' '));
                      box.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {turns.map((t) => (
            <article
              key={t.id}
              className={`idea-turn ${t.speaker === DRAFTER ? 'idea-turn--drafter' : 'idea-turn--person'}`}
              data-speaker={t.speaker}
            >
              <div className="idea-turn__who">
                {t.speaker}
                {t.draft ? (
                  <span className="eg-chip eg-chip--warning">a draft, not confirmed</span>
                ) : null}
              </div>
              <div className="idea-turn__body">
                <Prose text={t.text} />
              </div>
              {t.meta?.files?.length ? (
                <div className="idea-turn__files">
                  {t.meta.files.map((f) => (
                    <a
                      key={f}
                      className="eg-chip eg-chip--mono"
                      href={`/api/site/${p.siteId}/idea/files/${encodeURIComponent(f)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {f}
                    </a>
                  ))}
                </div>
              ) : null}
              {t.meta?.sources?.length ? (
                <details className="idea-turn__sources">
                  <summary>
                    {t.meta.sources.length === 1
                      ? 'One page the search read'
                      : `${t.meta.sources.length} pages the search read`}
                  </summary>
                  <ul>
                    {t.meta.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {t.meta?.cards?.length ? (
                <div className="idea-turn__cards">
                  {t.meta.cards.map((c) => {
                    const by = decidedTitles.get(c.title);
                    return (
                      <div key={c.title} className="idea-card" data-card={c.title}>
                        <div className="idea-card__title">{c.title}</div>
                        <p>{c.statement}</p>
                        {by ? (
                          <span className="eg-chip eg-chip--accent">Decided, by {by}</span>
                        ) : (
                          <button
                            type="button"
                            className="eg-btn eg-btn--sm"
                            onClick={() => void agree(c)}
                          >
                            Yes, write this card
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </article>
          ))}
          {thinking ? (
            <div className="idea-turn idea-turn--drafter idea-turn--thinking" aria-live="polite">
              <div className="idea-turn__who">{DRAFTER}</div>
              <div className="idea-turn__body eg-muted">
                {webSearch ? 'Reading and searching the web…' : 'Thinking it over…'}
              </div>
            </div>
          ) : null}
        </div>

        {note ? (
          <p className="flag grey" role="alert">
            {note}
          </p>
        ) : null}
        {p.noDrafter ? (
          <p className="flag grey" role="alert">
            {p.noDrafter}
          </p>
        ) : null}

        <form
          className="eg-ask idea-room__composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {attached.length ? (
            <div className="idea-room__attached">
              {attached.map((f) => (
                <span key={f} className="eg-chip eg-chip--mono">
                  {f}{' '}
                  <button
                    type="button"
                    aria-label={`Take ${f} off this message`}
                    onClick={() => setAttached((a) => a.filter((x) => x !== f))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            ref={box}
            className="eg-ask__input"
            aria-label="Your message"
            placeholder={`Tell the room about ${p.name}…`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="eg-ask__bar">
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="Files to add"
              onChange={(e) => {
                if (e.target.files) void upload(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="eg-btn eg-btn--ghost eg-btn--sm"
              disabled={uploading}
              onClick={() => picker.current?.click()}
            >
              {uploading ? 'Adding…' : 'Add files'}
            </button>
            <button
              type="button"
              className={`eg-chip${webSearch ? ' eg-chip--accent' : ''}`}
              aria-pressed={webSearch}
              disabled={Boolean(p.noSearch)}
              title={p.noSearch ?? 'Let the drafter search the web for this message'}
              onClick={() => setWebSearch((w) => !w)}
            >
              Search the web{webSearch ? ': on' : ''}
            </button>
            <span className="eg-spacer" />
            <button
              type="submit"
              className="eg-btn eg-btn--primary"
              disabled={!text.trim() || thinking || Boolean(p.noDrafter)}
            >
              Send
            </button>
          </div>
        </form>
      </div>

      <aside className="idea-room__side">
        <section className="eg-card idea-side">
          <h3 className="eg-card__title">Files in the room</h3>
          <button
            type="button"
            className="idea-drop"
            onClick={() => picker.current?.click()}
            disabled={uploading}
          >
            Drop files here, or choose them
          </button>
          {files.length ? (
            <ul className="idea-files">
              {files.map((f) => (
                <li key={f.name}>
                  <a
                    href={`/api/site/${p.siteId}/idea/files/${encodeURIComponent(f.name)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.name}
                  </a>
                  <span className="eg-muted">
                    {' '}
                    {size(f.bytes)}
                    {f.addedBy ? `, by ${f.addedBy}` : ''}
                    {f.kind === 'other' ? ' · the drafter cannot read this kind yet' : ''}
                  </span>
                  {!attached.includes(f.name) ? (
                    <button
                      type="button"
                      className="eg-btn eg-btn--ghost eg-btn--sm"
                      onClick={() => setAttached((a) => [...a, f.name])}
                    >
                      Use in my next message
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="eg-muted">No files yet.</p>
          )}
        </section>

        <section className="eg-card idea-side">
          <h3 className="eg-card__title">Scratchpad</h3>
          <textarea
            className="idea-pad"
            aria-label="Scratchpad"
            placeholder="Notes everyone in the room can see and add to."
            value={pad}
            rows={8}
            onChange={(e) => setPad(e.target.value)}
            onBlur={() => void savePad()}
          />
          <div className="rama-row">
            <button
              type="button"
              className="eg-btn eg-btn--sm"
              disabled={pad === padSaved.text}
              onClick={() => void savePad()}
            >
              Save notes
            </button>
            <span className="eg-muted">
              {pad !== padSaved.text
                ? 'Not saved yet.'
                : padSaved.savedBy
                  ? `Saved by ${padSaved.savedBy}.`
                  : ''}
            </span>
          </div>
        </section>

        <section className="eg-card idea-side">
          <h3 className="eg-card__title">Cards</h3>
          {decided.length || p.open ? (
            <>
              <p className="eg-muted">
                {decided.length === 1 ? 'One card decided' : `${decided.length} cards decided`}
                {p.open ? `, ${p.open} still open` : ''}.
              </p>
              <ul className="idea-decided">
                {decided.map((d) => (
                  <li key={d.title}>
                    {d.title} <span className="eg-muted">by {d.by}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="eg-muted">
              None yet. As the idea takes shape, the drafter proposes cards; each one you say yes to
              is written in your name.
            </p>
          )}
        </section>
      </aside>
    </section>
  );
}
