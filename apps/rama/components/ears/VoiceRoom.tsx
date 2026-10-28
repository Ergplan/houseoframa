'use client';
// The voice in the room (Stage 10), in Harmony's VoiceBar: it stays at the foot of every page of a site
// while the session lasts, so "show me" can move the room without the voice going quiet. Each person in
// the room has a button to hold while they talk; what they said goes to House of Rama with their name,
// and the voice reads only the lines that come back. The voice is OpenAI's Realtime voice over WebRTC
// (the server opens it with the key from Settings), or, with no key, a stand-in that shows each line,
// speaks it with the browser's own voice where it can, and takes what each person says as typed text.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Line = {
  kind: string;
  text: string;
  event: unknown;
  go: string | null;
  drafted?: 'builder' | 'drafter';
};
type Reply = {
  ok: boolean;
  sentence?: string;
  act?: number;
  lines?: Line[];
  go?: string | null;
  board?: boolean;
  camera?: 'turn-left' | 'turn-right' | 'turn-around' | 'closer' | 'further' | null;
  flow?: string | null;
  decided?: { title: string; by: string } | null;
};
type Said = { speaker: string; text: string; flag?: string; drafted?: 'builder' | 'drafter' };
type Read = { said: string; usage: { inputTokens: number; outputTokens: number; ms: number } };
export type VoiceModeView = { mode: 'live'; label: string } | { mode: 'stand-in'; why: string };

const ACTS = [
  '',
  'Act 1: arrive',
  'Act 2: the idea and the cards',
  'Act 3: the design, aloud',
  'Agreed: build it',
];

/** The live voice: a peer connection to the vendor, the microphone, and the events channel. */
class LiveVoice {
  pc: RTCPeerConnection | null = null;
  dc: RTCDataChannel | null = null;
  mic: MediaStreamTrack | null = null;
  audio = typeof Audio !== 'undefined' ? new Audio() : null;
  /** The speaker of each committed turn, by the vendor's item id. */
  speakers = new Map<string, string>();
  talking: string | null = null;
  waiting: ((read: Read) => void) | null = null;
  spoken = '';
  started = 0;
  constructor(
    private siteId: string,
    private heard: (speaker: string, text: string) => void,
  ) {}

  async start(): Promise<void> {
    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.ontrack = (e) => {
      if (this.audio) {
        this.audio.srcObject = e.streams[0]!;
        this.audio.autoplay = true;
        void this.audio.play().catch(() => {});
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mic = stream.getAudioTracks()[0]!;
    this.mic.enabled = false;
    pc.addTrack(this.mic, stream);
    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;
    const opened = new Promise<void>((resolve) => (dc.onopen = () => resolve()));
    dc.onmessage = (m) => this.event(JSON.parse(String(m.data)));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(`/api/site/${this.siteId}/voice/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/sdp' },
      body: offer.sdp ?? '',
    });
    if (!res.ok)
      throw new Error(
        ((await res.json()) as { sentence?: string }).sentence ?? `HTTP ${res.status}`,
      );
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    await opened;
  }

  private event(e: Record<string, unknown>) {
    const type = e.type as string;
    if (type === 'input_audio_buffer.committed' && this.talking)
      this.speakers.set(e.item_id as string, this.talking);
    else if (type === 'conversation.item.input_audio_transcription.completed') {
      const who = this.speakers.get(e.item_id as string);
      const text = String(e.transcript ?? '').trim();
      if (who && text) this.heard(who, text);
    } else if (type === 'response.output_audio_transcript.done')
      this.spoken = String(e.transcript ?? '');
    else if (type === 'response.done') {
      const usage = (e.response as { usage?: { input_tokens?: number; output_tokens?: number } })
        ?.usage;
      const w = this.waiting;
      this.waiting = null;
      w?.({
        said: this.spoken,
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          ms: Date.now() - this.started,
        },
      });
      this.spoken = '';
    }
  }

  /** Reads one line; resolves with what the voice actually said and what the vendor counted for it. */
  say(line: Line): Promise<Read> {
    return new Promise((resolve) => {
      this.waiting = resolve;
      this.started = Date.now();
      this.dc?.send(JSON.stringify(line.event));
    });
  }

  press(who: string) {
    this.talking = who;
    this.dc?.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    if (this.mic) this.mic.enabled = true;
  }

  release() {
    if (this.mic) this.mic.enabled = false;
    this.dc?.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  }

  /** Puts a recorded clip where the microphone is, for the recorded rehearsal; resolves when it ends. */
  async playClip(who: string, url: string): Promise<void> {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'audio');
    const mic = this.mic;
    await sender?.replaceTrack(dest.stream.getAudioTracks()[0]!);
    this.press(who);
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
    // A moment of silence so the end of the clip is in the turn.
    await new Promise((r) => setTimeout(r, 400));
    this.release();
    await sender?.replaceTrack(mic);
    await ctx.close();
  }

  stop() {
    this.mic?.stop();
    this.pc?.close();
  }
}

export function VoiceRoom({
  siteId,
  members,
  present,
  mode,
  open,
  idea: ideaOpen,
  people: roomPeople,
  act: startAct,
  clips,
}: {
  siteId: string;
  members: string[];
  /** The person signed in: the one ticked in the room until others are. */
  present: string;
  mode: VoiceModeView;
  /** Whether a session with the voice is open on the server. */
  open: boolean;
  /** The open session is held in the idea room (Stage 12): the drafter answers, the voice reads it. */
  idea: boolean;
  people: string[];
  act: number;
  /** Whether a recorded clip may stand in for the microphone (the recorded rehearsal). */
  clips: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();
  const [people, setPeople] = useState<string[]>(roomPeople);
  const [chosen, setChosen] = useState<string[]>(
    members.includes(present) ? [present] : members.slice(0, 1),
  );
  const [act, setAct] = useState(startAct);
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [caption, setCaption] = useState(open ? 'The voice is ready when you are.' : '');
  const [talk, setTalk] = useState<Said[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [typed, setTyped] = useState('');
  /** The session is by chat: no microphone, and the voice's lines are shown, not spoken. */
  const chat = useRef(false);
  const [ideaMode, setIdeaMode] = useState(ideaOpen);
  const [writer, setWriter] = useState(
    roomPeople.length && !roomPeople.includes(present) ? roomPeople[0]! : present,
  );
  const [board, setBoard] = useState<string | null>(null);
  const live = useRef<LiveVoice | null>(null);
  const transcript = useRef<HTMLOListElement | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const post = useCallback(
    async (path: string, body?: unknown): Promise<Reply> => {
      const res = await fetch(`/api/site/${siteId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      return (await res.json()) as Reply;
    },
    [siteId],
  );

  const readBoard = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]!;
      const r = (await post('board', { mediaType: 'image/jpeg', base64 })) as Reply & {
        board?: { reading: { boxes: { label: string }[]; arrows: unknown[] } };
      };
      setBoard(
        r.ok && r.board
          ? `Draft from the board: ${r.board.reading.boxes.length} boxes (${r.board.reading.boxes.map((b) => b.label).join(', ')}), ${r.board.reading.arrows.length} arrows. Nothing is decided from it.`
          : `The board could not be read: ${r.sentence}`,
      );
    } catch (err) {
      setBoard(
        `The board could not be read: the camera gave no picture (${(err as Error).message}).`,
      );
    }
  }, [post]);

  /** Reads the lines one after another, moving the room where each one says, and keeps what was said. */
  const speak = useCallback(
    (r: Reply) => {
      if (!r.ok) {
        setError(r.sentence ?? 'Something went wrong.');
        setState('idle');
        return queue.current;
      }
      if (r.act) setAct(r.act);
      queue.current = queue.current.then(async () => {
        if (r.go) router.push(r.go);
        // "Show me the flow": the Building level plays it (components/lakefront/BuildingView.tsx).
        if (r.flow !== undefined)
          window.dispatchEvent(new CustomEvent('rama:flow', { detail: r.flow }));
        if (r.camera) {
          // The voice moves the same camera as the ring (components/lakefront/useCamera.ts).
          const detail =
            r.camera === 'closer' || r.camera === 'further'
              ? { type: 'zoom', factor: r.camera === 'closer' ? 1.25 : 0.8 }
              : { type: 'turn', by: r.camera.slice(5) };
          window.dispatchEvent(new CustomEvent('rama:camera', { detail }));
        }
        for (const line of r.lines ?? []) {
          if (line.go) router.push(line.go);
          setState('speaking');
          setCaption(line.text);
          let said = line.text;
          let usage: Read['usage'] | undefined;
          if (live.current) {
            const read = await live.current.say(line);
            said = read.said || line.text;
            usage = read.usage;
          } else if (!chat.current) await standInSpeak(line.text);
          const check = (await post('voice/said', {
            text: said,
            line: line.text,
            ...(usage ? { usage } : {}),
          })) as Reply & {
            mouth?: { ok: boolean; unsupported: number[] };
          };
          setTalk((t) => [
            ...t,
            {
              speaker: 'Rama',
              text: said,
              ...(line.drafted ? { drafted: line.drafted } : {}),
              ...(check.mouth && !check.mouth.ok
                ? {
                    flag: `The voice said ${check.mouth.unsupported.join(', ')}, which no builder line gave it.`,
                  }
                : {}),
            },
          ]);
        }
        if (r.board) await readBoard();
        setState('idle');
        router.refresh();
      });
      return queue.current;
    },
    [post, readBoard, router],
  );

  const heard = useCallback(
    async (
      speaker: string,
      text: string,
      extra: { files?: string[]; webSearch?: boolean } = {},
    ) => {
      setTalk((t) => [...t, { speaker, text }]);
      setState('thinking');
      setCaption(`${speaker}: ${text}`);
      // In the idea room the conversation is the room's: it shows the turn and the drafter's reply.
      if (ideaMode)
        window.dispatchEvent(
          new CustomEvent('rama:idea-asking', { detail: { speaker, text, files: extra.files } }),
        );
      const focus = new URLSearchParams(window.location.search).get('figure');
      const r = (await post('voice/heard', { speaker, text, focus, ...extra })) as Reply & {
        idea?: { turn: unknown };
      };
      if (ideaMode)
        window.dispatchEvent(
          new CustomEvent('rama:idea-turn', {
            detail: r.ok && r.idea ? { turn: r.idea.turn } : { error: r.sentence },
          }),
        );
      await speak(r);
    },
    [post, speak, ideaMode],
  );

  const connect = useCallback(
    async (byChat = false) => {
      setError(null);
      chat.current = byChat;
      if (mode.mode === 'live' && !byChat) {
        try {
          const v = new LiveVoice(siteId, (s, t) => void heard(s, t));
          await v.start();
          live.current = v;
        } catch (err) {
          setError(`The voice could not start: ${(err as Error).message}`);
          return false;
        }
      }
      setConnected(true);
      return true;
    },
    [mode.mode, siteId, heard],
  );

  const begin = async (byChat = false, idea = false) => {
    const r = await post('voice/start', { people: chosen, idea });
    setIdeaMode(idea);
    if (!r.ok) return setError(r.sentence ?? 'The room could not open.');
    setPeople(chosen);
    setWriter(chosen.includes(present) ? present : chosen[0]!);
    if (await connect(byChat)) await speak(r);
  };

  // "Talk with the voice" in the idea room (Stage 12): the session opens with the person signed in.
  useEffect(() => {
    const on = (e: Event) => {
      if (!open && !connected)
        void begin(false, Boolean((e as CustomEvent<{ idea?: boolean }>).detail?.idea));
    };
    window.addEventListener('rama:voice-start', on);
    return () => window.removeEventListener('rama:voice-start', on);
  });

  // The idea room sends what is typed there through the voice while it is on, so the reply is read.
  useEffect(() => {
    const say = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; files?: string[]; webSearch?: boolean }>).detail;
      void heard(people.includes(present) ? present : people[0]!, d.text, {
        files: d.files ?? [],
        webSearch: Boolean(d.webSearch),
      });
    };
    const tell = () =>
      window.dispatchEvent(
        new CustomEvent('rama:voice-state', { detail: { on: connected && ideaMode } }),
      );
    tell();
    window.addEventListener('rama:voice-say', say);
    window.addEventListener('rama:voice-ask-state', tell);
    return () => {
      window.removeEventListener('rama:voice-say', say);
      window.removeEventListener('rama:voice-ask-state', tell);
    };
  }, [connected, ideaMode, heard, people, present]);

  // "Close ideation" from the console comes here as ?act=agree.
  const agreeAsked = search.get('act') === 'agree';
  useEffect(() => {
    if (agreeAsked && connected) void post('voice/agree').then(speak);
  }, [agreeAsked, connected, post, speak]);

  // Test hook for the recorded rehearsal: a clip in place of the microphone, then wait for the room.
  useEffect(() => {
    if (!clips) return;
    (window as unknown as { ramaVoice?: unknown }).ramaVoice = {
      say: async (who: string, url: string) => {
        if (!live.current) throw new Error('the live voice is not connected');
        await live.current.playClip(who, url);
      },
      idle: () => queue.current,
    };
  }, [clips]);

  useEffect(() => () => live.current?.stop(), []);
  // A step of a figure's flow, as the water reaches it, is builder text for the voice to read.
  useEffect(() => {
    if (!connected) return;
    const on = (e: Event) => {
      const { figure, step } = (e as CustomEvent<{ figure: string; step: number }>).detail;
      void post('voice/tell', { figure, step }).then(speak);
    };
    window.addEventListener('rama:tell', on);
    return () => window.removeEventListener('rama:tell', on);
  }, [connected, post, speak]);
  // The transcript follows the conversation: the latest turn is always in view.
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [talk]);

  // Before a session, the room is offered in the site office only.
  if (!open && !connected && !pathname.endsWith('/discovery')) return null;
  if (!open && !connected)
    return (
      <section className="eg-card voice-start" aria-label="The voice">
        <h2 className="eg-card__title">A session with the voice</h2>
        <p className="eg-muted">
          The voice asks, reads back and writes nothing down: what is decided is decided by a
          person’s yes.{' '}
          {mode.mode === 'live'
            ? `It speaks with ${mode.label}.`
            : `It is the stand-in voice: ${mode.why}.`}{' '}
          Who is in the room?
        </p>
        <div className="voice-people">
          {members.map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={chosen.includes(m)}
                onChange={(e) =>
                  setChosen((c) => (e.target.checked ? [...c, m] : c.filter((x) => x !== m)))
                }
              />{' '}
              {m}
            </label>
          ))}
        </div>
        <div className="rama-row">
          <button className="eg-btn" disabled={!chosen.length} onClick={() => void begin()}>
            Start the session with the voice
          </button>
          <button className="eg-btn" disabled={!chosen.length} onClick={() => void begin(true)}>
            Start the session by chat
          </button>
        </div>
        {error ? <p className="eg-muted voice-error">{error}</p> : null}
      </section>
    );

  return (
    <section className="voice-room" aria-label="The voice" data-act={act}>
      <div className="voice-room__head">
        <span className="eg-voice-label">{ACTS[act] ?? ''}</span>
        {mode.mode === 'stand-in' ? (
          <span className="eg-muted"> · stand-in voice: {mode.why}</span>
        ) : null}
      </div>
      <div className="eg-voice" data-state={state}>
        <span className="eg-voice__orb">
          <i />
        </span>
        <div className="eg-voice__body">
          <div className="eg-voice__text" aria-live="polite" data-testid="voice-caption">
            {caption}
          </div>
        </div>
      </div>
      {!connected ? (
        <div className="rama-row">
          <button className="eg-btn" onClick={() => void connect()}>
            Rejoin the voice
          </button>
          <button className="eg-btn" onClick={() => void connect(true)}>
            Carry on by chat
          </button>
        </div>
      ) : (
        <div className="voice-room__talk">
          {live.current
            ? people.map((p) => (
                <button
                  key={p}
                  className="eg-btn"
                  onPointerDown={() => {
                    setState('listening');
                    setCaption(`${p} is talking…`);
                    live.current?.press(p);
                  }}
                  onPointerUp={() => {
                    setState('thinking');
                    live.current?.release();
                  }}
                >
                  Hold to talk: {p}
                </button>
              ))
            : null}
          {act === 2 ? (
            <button className="eg-btn" onClick={() => void post('voice/agree').then(speak)}>
              Close ideation
            </button>
          ) : null}
          <button className="eg-btn" onClick={() => void readBoard()}>
            Read the board
          </button>
          <button
            className="eg-btn"
            onClick={async () => {
              await post('voice/end');
              live.current?.stop();
              live.current = null;
              setConnected(false);
              router.refresh();
            }}
          >
            End the session
          </button>
        </div>
      )}
      {error ? <p className="voice-error">{error}</p> : null}
      {board ? (
        <p className="eg-muted" data-testid="voice-board">
          {board}
        </p>
      ) : null}
      {talk.length && !ideaMode ? (
        <ol className="voice-room__transcript" data-testid="voice-transcript" ref={transcript}>
          {talk.map((t, i) => (
            <li key={i} className={t.speaker === 'Rama' ? 'agent' : ''}>
              <b>{t.speaker}</b> {t.text}
              {t.drafted ? (
                <span className="pill dim">
                  {' '}
                  drafted by the builder, unconfirmed until a named yes
                </span>
              ) : null}
              {t.flag ? <span className="pill amber"> {t.flag}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {connected && !ideaMode ? (
        // The chat: the same turn as a spoken one, typed; the voice's answer comes back in the transcript.
        <form
          className="voice-room__typed"
          onSubmit={(e) => {
            e.preventDefault();
            const text = typed.trim();
            if (!text) return;
            setTyped('');
            void heard(writer, text);
          }}
        >
          {people.length > 1 ? (
            <select
              className="eg-input"
              aria-label="Who is writing"
              value={writer}
              onChange={(e) => setWriter(e.target.value)}
            >
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          ) : null}
          <input
            className="eg-input"
            aria-label={`What ${writer} said`}
            placeholder={`Write to the voice as ${writer}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button type="submit" className="eg-btn">
            Send
          </button>
        </form>
      ) : null}
    </section>
  );
}

/** The stand-in voice: the browser's own speech where it has one; a pause in proportion otherwise. */
function standInSpeak(text: string): Promise<void> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || navigator.webdriver) return new Promise((r) => setTimeout(r, 50));
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}
