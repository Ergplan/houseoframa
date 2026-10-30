'use client';
// The film (Stage 13): a product's build as a person who does not write code watches it, alone with the
// voice. Seven scenes left to right, each with one lit action: the plan, the design, the foundation laid
// block by block, the build itself (the builder's own words, the code typed in, a card for every file,
// the building filling), the product's own code running on its real data, the ground (what a database
// is, who may change what), and the walk through. Everything shown comes from the film the server
// assembled from the record; this component only plays it. Its look is design/film/index.html.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  drawFilm,
  drawFoundation,
  orientStreet,
  pickFilm,
  pipeFromTable,
  type FilmFrame,
  type FilmPipe,
  type FloorKind,
  type Orientation,
  type Street,
} from '@rama/stage';
import type { Film, FilmFile, FilmLift } from '@rama/workbench';
import type { Flow } from '@rama/trace';
import { usePalette, useReducedMotion } from '../lakefront/live';
import { actWords, liftBeats, type Beat } from './beats';

export type FilmScene = 'plan' | 'design' | 'foundation' | 'build' | 'try' | 'ground' | 'walk';

const SCENES: { id: FilmScene; label: string }[] = [
  { id: 'plan', label: 'The plan' },
  { id: 'design', label: 'The design' },
  { id: 'foundation', label: 'The foundation' },
  { id: 'build', label: 'The build' },
  { id: 'try', label: 'Try it' },
  { id: 'ground', label: 'The ground' },
  { id: 'walk', label: 'Walk through' },
];

const ORI: Orientation[] = ['north', 'east', 'south', 'west'];

export interface FilmProps {
  film: Film;
  street: Street | null;
  flags: Record<string, { word: string; good: boolean }>;
  facades: Record<
    string,
    {
      screen: string;
      title: string;
      shot: string | null;
      figures: { key: string; text: string; traced: boolean }[];
    }[]
  >;
  flows: Flow[];
  signed: { screen: string; person: string; at: string; statement: string; seal: string | null }[];
  person: { name: string; role: string };
  start: FilmScene | null;
  trainer: boolean;
  /** The trainer's call about this product, while it is not answered. */
  called?: { at: string; sentence: string; next: string | null } | null;
}

/** The voice: one line at a time, read aloud by the browser's stand-in voice when asked. */
function useVoice() {
  const [line, setLine] = useState<{ who: string; text: string }>({ who: 'The Voice', text: '' });
  const [aloud, setAloud] = useState(false);
  const say = useCallback(
    (who: string, text: string) => {
      setLine({ who, text });
      if (aloud && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN';
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    },
    [aloud],
  );
  return { line, say, aloud, setAloud };
}

export function FilmPlayer(p: FilmProps) {
  const first: FilmScene =
    p.start ?? (p.film.lifts.length ? 'build' : p.film.steps.length ? 'plan' : 'plan');
  const [scene, setScene] = useState<FilmScene>(first);
  const voice = useVoice();
  useEffect(() => {
    const h = window.location.hash.slice(1) as FilmScene;
    if (SCENES.some((s) => s.id === h)) setScene(h);
  }, []);
  const go = (s: FilmScene) => {
    setScene(s);
    try {
      history.replaceState(null, '', `#${s}`);
    } catch {
      // no history: the scene still changes
    }
  };
  const nextOf = (s: FilmScene) => SCENES[SCENES.findIndex((x) => x.id === s) + 1]?.id ?? null;
  return (
    <div className="film" data-scene={scene}>
      <div className="film-top">
        <div>
          <div className="film-eyebrow">{p.film.site.name}</div>
          <div className="film-idea">{p.film.site.idea}</div>
        </div>
        <nav className="film-tabs" aria-label="The film">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`film-tab${s.id === scene ? ' on' : ''}`}
              aria-current={s.id === scene ? 'step' : undefined}
              onClick={() => go(s.id)}
            >
              <i>{i + 1}</i>
              {s.label}
            </button>
          ))}
        </nav>
      </div>
      {p.called ? (
        <div className="film-called" role="status" data-called>
          <span className="film-flagpole">
            <i /> Grey flag
          </span>
          <span>
            The Builder could not get past this by itself: {p.called.sentence} A trainer has been
            called ({new Date(p.called.at).toLocaleString('en-IN')}). You can wait, or look around
            the film.
          </span>
        </div>
      ) : null}
      <div className="film-stage">
        {scene === 'plan' && <PlanScene {...p} say={voice.say} onNext={() => go('design')} />}
        {scene === 'design' && (
          <DesignScene {...p} say={voice.say} onNext={() => go('foundation')} />
        )}
        {scene === 'foundation' && (
          <FoundationScene {...p} say={voice.say} onNext={() => go('build')} />
        )}
        {scene === 'build' && <BuildScene {...p} say={voice.say} onNext={() => go('try')} />}
        {scene === 'try' && <TryScene {...p} say={voice.say} onNext={() => go('ground')} />}
        {scene === 'ground' && <GroundScene {...p} say={voice.say} onNext={() => go('walk')} />}
        {scene === 'walk' && <WalkScene {...p} say={voice.say} />}
      </div>
      <div className="film-voice" data-voice>
        <div className={`film-wave${voice.line.text ? '' : ' quiet'}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="film-voice-line">
          <b>{voice.line.who}</b>
          <span>{voice.line.text}</span>
        </div>
        <div className="film-voice-acts">
          <button
            type="button"
            className="film-btn quiet"
            onClick={() => voice.setAloud(!voice.aloud)}
          >
            {voice.aloud ? 'Stop reading aloud' : 'Read aloud'}
          </button>
          {nextOf(scene) ? null : null}
          {p.trainer ? (
            <a className="film-btn quiet" href={`/site/${encodeURIComponent(p.film.site.id)}`}>
              Trainer view
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type SceneProps = FilmProps & { say: (who: string, text: string) => void; onNext?: () => void };

// ---------------------------------------------------------------------------------------------------
// The stage: the Street drawn as glass, filling as the film plays. Turn and zoom like the lakefront.

interface StageProps {
  street: Street;
  frame: (t: number) => Omit<FilmFrame, 'street' | 'palette' | 'time'>;
  onPick?: (pick: { building: string } | { table: string } | null) => void;
  children?: ReactNode;
  label?: string;
}

function FilmStage({ street, frame, onPick, children, label }: StageProps) {
  const pal = usePalette();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const [ori, setOri] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const s = useMemo(() => orientStreet(street, ORI[ori]!), [street, ori]);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const view = useRef({ scale: 1, dx: 0, dy: 0 });
  useEffect(() => {
    if (!pal) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const c = ref.current;
      if (c) {
        const r = c.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
          c.width = Math.round(r.width * dpr);
          c.height = Math.round(r.height * dpr);
        }
        const ctx = c.getContext('2d');
        if (ctx) {
          const fit = Math.min(r.width / s.width, r.height / s.height) * zoom;
          const dx = (r.width - s.width * fit) / 2;
          const dy = (r.height - s.height * fit) / 2;
          view.current = { scale: fit, dx, dy };
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, r.width, r.height);
          ctx.setTransform(dpr * fit, 0, 0, dpr * fit, dpr * dx, dpr * dy);
          const t = reduced ? 0 : (performance.now() - t0) / 1000;
          drawFilm(ctx, { street: s, palette: pal, time: t, ...frameRef.current(t) });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pal, s, zoom, reduced]);
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const v = view.current;
    onPick(
      pickFilm(s, {
        x: (e.clientX - r.left - v.dx) / v.scale,
        y: (e.clientY - r.top - v.dy) / v.scale,
      }),
    );
  };
  return (
    <div className="film-canvas">
      <canvas
        ref={ref}
        onClick={click}
        aria-label={label ?? 'The product as glass buildings on its ground'}
      />
      <div className="film-cam">
        <button type="button" className="film-btn" onClick={() => setOri((o) => (o + 3) % 4)}>
          ↺ Turn left
        </button>
        <button type="button" className="film-btn" onClick={() => setOri((o) => (o + 1) % 4)}>
          Turn right ↻
        </button>
        <button
          type="button"
          className="film-btn"
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
        >
          + Closer
        </button>
        <button
          type="button"
          className="film-btn"
          onClick={() => setZoom((z) => Math.max(0.6, z / 1.2))}
        >
          − Further
        </button>
      </div>
      {children}
    </div>
  );
}

const noPlots = {} as Record<string, { lit: boolean; rows: number | null }>;
const empty = new Set<string>();

/** Every file standing once the film has played to the end of lift k (0: the foundation only). */
function laidUpTo(film: Film, k: number): Set<string> {
  const out = new Set<string>(film.foundation?.frames.map((f) => f.path) ?? []);
  for (const l of film.lifts.slice(0, k))
    for (const f of l.files) {
      if (f.status === 'deleted') out.delete(f.path);
      else out.add(f.path);
    }
  return out;
}

function litUpTo(film: Film, k: number): Record<string, { lit: boolean; rows: number | null }> {
  const out: Record<string, { lit: boolean; rows: number | null }> = {};
  for (const l of film.lifts.slice(0, k))
    for (const t of l.tablesLit) out[t] = { lit: true, rows: null };
  return out;
}

// ---------------------------------------------------------------------------------------------------
// 1. The plan: the cards, numbered, as the voice reads them.

function PlanScene(p: SceneProps) {
  const { film } = p;
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!film.steps.length) {
      p.say('The Voice', 'There is no plan yet. Tell me what you want to make, in one sentence.');
      return;
    }
    p.say('The Voice', `Here is the plan in ${film.steps.length} steps. I will read each one.`);
    const t = setInterval(() => setK((x) => (x < film.steps.length ? x + 1 : x)), 1800);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const s = film.steps[k - 1];
    if (s) p.say('The Voice', `${s.n}. ${s.title}. ${s.statement}`);
  }, [k]);
  const decided = film.steps.filter((s) => s.decided).length;
  return (
    <div className="film-two list-left">
      <div className="film-list">
        <div>
          <div className="film-eyebrow">The plan · {film.steps.length} steps · read aloud</div>
          <h2 className="film-h">Here is how it will be built.</h2>
        </div>
        {film.steps.map((s, i) => (
          <div key={s.n} className={`film-step${i < k ? ' in' : ''}`}>
            <span className="n">{s.n}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.statement}</p>
            </div>
            <span className={`film-chip${s.decided ? ' ok' : ''}`}>
              {s.decided ? `Yes · ${s.decided.by}` : 'Waiting for your yes'}
            </span>
          </div>
        ))}
        <div className="film-actions">
          <button type="button" className="film-btn lit" onClick={p.onNext}>
            {decided === film.steps.length && film.steps.length
              ? 'Now show me the design'
              : 'Show me the design'}
          </button>
          <span className="film-chip">
            {decided} of {film.steps.length} steps said yes to, each in a person’s name
          </span>
        </div>
      </div>
      {p.street ? (
        <FilmStage
          street={p.street}
          frame={() => ({
            laid: empty,
            live: null,
            plots: noPlots,
            flags: {},
            agent: null,
            pipes: [],
            highlight: {},
          })}
        >
          <div className="film-legend">
            <span className="film-chip">A glass building for each thing it does</span>
            <span className="film-chip">The ground is the database</span>
          </div>
        </FilmStage>
      ) : (
        <div className="film-canvas film-none">The Street appears when the plan is decided.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 2. The design: the architecture, read aloud and lit, before a single block.

interface DesignBeat {
  title: string;
  text: string;
  light: {
    building?: string | null;
    table?: string | null;
    floor?: FloorKind | null;
    floors?: boolean;
    pipes?: boolean;
  };
}

function designBeats(film: Film): DesignBeat[] {
  const feats = film.design.buildings.filter((b) => b.screens.length);
  const names = feats.map((b) => b.name);
  const t = film.design.tables;
  const svc = film.design.services;
  return [
    {
      title: `${feats.length} building${feats.length === 1 ? '' : 's'}, one for each thing it does`,
      text: `${names.join(', ')}. Each is glass: you can see every part inside it at any time.${film.design.buildings.length > feats.length ? ' Work that more than one building uses, or that no screen uses, stands in its own building beside them.' : ''}`,
      light: { building: feats[0]?.id ?? null },
    },
    {
      title: 'Every building has the same four floors',
      text: 'Remembers (what it keeps), Decides (its rules and sums), Talks to (the outside), Shows (its screens). A part always stands on the floor that says what it does.',
      light: { floor: 'decides', floors: true },
    },
    {
      title: 'The ground is the database',
      text: t.length
        ? `${t.length === 1 ? 'One table' : `${t.length} tables`}: ${t.map((x) => x.name).join(', ')}. A table lights up when a building writes to it, and you can open it and read its rows.`
        : 'This product keeps no table yet. When it does, each table is a plot in the ground.',
      light: { table: t[0]?.name ?? null },
    },
    {
      title: 'Across the water is the outside world',
      text: svc.length
        ? `It talks to ${svc.join(', ')}, across the water. That is the only way out, so what it reads can be kept and shown.`
        : 'It talks to no outside service. Everything it needs is on this side of the water.',
      light: {},
    },
    {
      title: 'Pipes carry every number',
      text: 'From a row in the ground, through the sum, to the figure on the screen. You will watch a number travel, and ask it questions on the way.',
      light: { pipes: true },
    },
    {
      title: 'A gate at the door, a checker from another company',
      text: 'Nothing changes unless a passing check exercises what it does and a person signs the screen. The Checker is not the Builder and signs its own report.',
      light: {},
    },
  ];
}

function DesignScene(p: SceneProps) {
  const beats = useMemo(() => designBeats(p.film), [p.film]);
  const [k, setK] = useState(0);
  useEffect(() => {
    const b = beats[k];
    if (b) p.say('The Voice', `${b.title}. ${b.text}`);
    const t = setTimeout(() => setK((x) => Math.min(beats.length - 1, x + 1)), 6500);
    return () => clearTimeout(t);
  }, [k]);
  const b = beats[k]!;
  const pipes: FilmPipe[] = [];
  if (b.light.pipes && p.street) {
    const t = p.film.design.tables[0];
    const w = t?.writers[0];
    const pts = t && w ? pipeFromTable(p.street, t.name, w, 'decides', true) : null;
    if (pts) pipes.push({ points: pts, t: null, label: null, kind: 'flow' });
  }
  return (
    <div className="film-two">
      {p.street ? (
        <FilmStage
          street={p.street}
          frame={(t) => ({
            laid: empty,
            live: null,
            plots: Object.fromEntries(
              p.film.design.tables.map((x) => [
                x.name,
                { lit: x.name === b.light.table, rows: null },
              ]),
            ),
            flags: {},
            agent: null,
            pipes: pipes.map((x) => ({ ...x, t: (t * 0.15) % 1 })),
            highlight: {
              building: b.light.building ?? null,
              table: b.light.table ?? null,
              floor: b.light.floor ?? null,
            },
            floorNames: Boolean(b.light.floors),
          })}
        >
          <div className="film-legend">
            <span className="film-chip">Nothing is built yet · this is the design</span>
          </div>
        </FilmStage>
      ) : (
        <div className="film-canvas film-none">The design appears when the plan is decided.</div>
      )}
      <div className="film-list">
        <div>
          <div className="film-eyebrow">The design · read aloud before the first block</div>
          <h2 className="film-h">How it will be built.</h2>
        </div>
        {beats.map((x, i) => (
          <button
            key={x.title}
            type="button"
            className={`film-beat${i === k ? ' on' : ''}`}
            onClick={() => setK(i)}
          >
            <i>{i + 1}</i>
            <span>
              <b>{x.title}</b>
              <small>{x.text}</small>
            </span>
          </button>
        ))}
        <div className="film-actions">
          <button type="button" className="film-btn lit" onClick={p.onNext}>
            Watch the foundation laid
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 3. The foundation: the house stack, one frame per file, filmed from the ground.

const LAYER_NAMES: [string, string, string][] = [
  ['talks', 'Talks to', 'the web, other services'],
  ['shows', 'Shows', 'the screens people see'],
  ['decides', 'Decides', 'the rules and the sums'],
  ['remembers', 'Remembers', 'the tables in the ground'],
  ['checks', 'Checks', 'tests and the gate at the door'],
];

function FoundationScene(p: SceneProps) {
  const frames = p.film.foundation?.frames ?? [];
  const pal = usePalette();
  const ref = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0); // in blocks, fractional
  const [playing, setPlaying] = useState(true);
  const [ori, setOri] = useState<0 | 1 | 2 | 3>(0);
  const [zoom, setZoom] = useState(1);
  const reduced = useReducedMotion();
  const per = 2.4; // seconds a block
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((x) => {
        const n = Math.min(frames.length, x + dt / per);
        if (n >= frames.length) setPlaying(false);
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames.length]);
  const cur = Math.min(frames.length - 1, Math.floor(t));
  const f = frames[cur];
  useEffect(() => {
    if (f) p.say('The Voice', f.what ?? `${f.path}: not explained yet.`);
  }, [cur]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !pal) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    drawFoundation(ctx, {
      palette: pal,
      width: r.width,
      height: r.height,
      blocks: frames.map((x) => ({ name: x.name, layer: x.layer })),
      laid: Math.floor(t),
      rise: reduced ? (t < frames.length ? 1 : 0) : t - Math.floor(t),
      orientation: ori,
      scale: Math.min(r.width / 900, r.height / 640) * 1.6 * zoom,
    });
  }, [t, pal, ori, zoom, frames, reduced]);
  if (!frames.length)
    return (
      <div className="film-canvas film-none">
        The foundation is laid when the build starts: the house stack every product here begins
        from.
      </div>
    );
  const laid = frames.slice(0, Math.floor(t) + (t % 1 > 0 ? 1 : 0));
  const count = (l: string) => laid.filter((x) => x.layer === l).length;
  return (
    <div className="film-two wide-left">
      <div className="film-canvas">
        <canvas ref={ref} aria-label="The foundation being laid" />
        <div className="film-cam">
          <button
            type="button"
            className="film-btn"
            onClick={() => setOri((o) => ((o + 3) % 4) as 0 | 1 | 2 | 3)}
          >
            ↺ Turn left
          </button>
          <button
            type="button"
            className="film-btn"
            onClick={() => setOri((o) => ((o + 1) % 4) as 0 | 1 | 2 | 3)}
          >
            Turn right ↻
          </button>
          <button
            type="button"
            className="film-btn"
            onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
          >
            + Closer
          </button>
          <button
            type="button"
            className="film-btn"
            onClick={() => setZoom((z) => Math.max(0.6, z / 1.2))}
          >
            − Further
          </button>
        </div>
        <span className="film-chip film-camlabel">
          Camera on the ground · one frame per file laid
        </span>
      </div>
      <div className="film-list">
        {f ? (
          <div className="film-folder">
            <span className="film-eyebrow">
              Block {cur + 1} of {frames.length} · {LAYER_NAMES.find((l) => l[0] === f.layer)?.[1]}
            </span>
            <h3>{f.name}</h3>
            <span className="film-path">{f.path}</span>
            <p>{f.what ?? 'Not explained yet.'}</p>
          </div>
        ) : null}
        <div className="film-arch">
          <span className="film-eyebrow">
            The architecture · every product here has these layers
          </span>
          {LAYER_NAMES.map(([id, name, holds]) => (
            <div key={id} className={`film-layer${f?.layer === id ? ' on' : ''}`}>
              <b>{name}</b>
              <span>{holds}</span>
              <small>
                {count(id)} block{count(id) === 1 ? '' : 's'}
              </small>
            </div>
          ))}
        </div>
        <div className="film-laid">
          {frames.map((x, i) => (
            <button
              key={x.path}
              type="button"
              className={`film-laid-b${i === cur ? ' on' : ''}`}
              onClick={() => {
                setT(i + 0.999);
                setPlaying(false);
              }}
            >
              <i>{i < laid.length ? '✓' : '·'}</i>
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <div className="film-timeline">
        <button
          type="button"
          className="film-btn"
          onClick={() => {
            if (t >= frames.length) setT(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : t >= frames.length ? 'Play again' : 'Play'}
        </button>
        <span className="film-frame">
          block {Math.min(frames.length, Math.floor(t) + 1)} of {frames.length}
        </span>
        <input
          type="range"
          min={0}
          max={frames.length}
          step={0.01}
          value={t}
          aria-label="Move through the foundation"
          onChange={(e) => {
            setT(Number(e.target.value));
            setPlaying(false);
          }}
        />
        <button type="button" className="film-btn lit" onClick={p.onNext}>
          Now watch it built
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 4. The build: lift by lift, the builder's own words, each file typed in, a card for every part.

interface CodeBlockView {
  from: number;
  to: number;
  kind: string;
  name: string | null;
  explanation: { state: 'confirmed' | 'unconfirmed' | 'none'; sentence?: string; by?: string };
}

/** The English of a file at a commit, from the code level (cached per file and commit). */
function useEnglish(siteId: string) {
  const cache = useRef(new Map<string, CodeBlockView[] | 'loading' | 'none'>());
  const [, bump] = useState(0);
  const get = useCallback(
    (path: string, commit: string): CodeBlockView[] | null => {
      const k = `${commit}:${path}`;
      const v = cache.current.get(k);
      if (v === undefined) {
        cache.current.set(k, 'loading');
        fetch(
          `/api/site/${encodeURIComponent(siteId)}/code?path=${encodeURIComponent(path)}&commit=${commit}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { view?: { blocks: CodeBlockView[] } } | null) => {
            cache.current.set(k, j?.view?.blocks ?? 'none');
            bump((x) => x + 1);
          })
          .catch(() => {
            cache.current.set(k, 'none');
            bump((x) => x + 1);
          });
        return null;
      }
      return Array.isArray(v) ? v : null;
    },
    [siteId],
  );
  return get;
}

/** The sentence for the part of a file that changed most: the block holding most new lines. */
function englishOf(
  blocks: CodeBlockView[] | null,
  f: FilmFile,
): CodeBlockView['explanation'] | null {
  if (!blocks) return null;
  const score = (b: CodeBlockView) => f.added.filter((l) => l >= b.from && l <= b.to).length;
  const best = [...blocks]
    .filter((b) => b.explanation.state !== 'none')
    .sort((a, b) => score(b) - score(a))[0];
  return best?.explanation ?? { state: 'none' };
}

interface Pos {
  lift: number;
  beat: number;
  /** Characters of words, or lines of a file, shown so far. */
  shown: number;
}

function BuildScene(p: SceneProps) {
  const { film } = p;
  const english = useEnglish(film.site.id);
  const beats = useMemo(() => film.lifts.map(liftBeats), [film]);
  const [pos, setPos] = useState<Pos | 'end'>(
    film.lifts.length ? { lift: 0, beat: 0, shown: 0 } : 'end',
  );
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const liftN = pos === 'end' ? film.lifts.length - 1 : pos.lift;
  const lift: FilmLift | undefined = film.lifts[liftN];
  const beat: Beat | undefined = pos === 'end' ? undefined : beats[pos.lift]?.[pos.beat];
  const file: FilmFile | undefined = beat?.kind === 'file' ? lift?.files[beat.index] : undefined;
  const flagged = beat?.kind === 'checked' && lift?.checked && !lift.checked.ok;

  // The voice reads each beat once, as it starts.
  const beatKey = pos === 'end' ? 'end' : `${pos.lift}:${pos.beat}`;
  useEffect(() => {
    if (!beat || !lift) return;
    if (beat.kind === 'say')
      p.say(
        beat.source === 'builder' ? 'The Builder · its own words' : 'The Builder · what changed',
        beat.text,
      );
    else if (beat.kind === 'checked') {
      const c = lift.checked;
      p.say(
        'The Checker · the result, as it is',
        c
          ? c.ok
            ? 'The checks passed. The gate lets this lift through.'
            : `Grey flag. ${c.sentence}`
          : 'Not checked.',
      );
    } else if (beat.kind === 'file' && file) p.say('The Builder', `Writing ${file.path}.`);
  }, [beatKey]);

  const advance = useCallback(() => {
    setPos((cur) => {
      if (cur === 'end') return cur;
      const bs = beats[cur.lift]!;
      if (cur.beat + 1 < bs.length) return { lift: cur.lift, beat: cur.beat + 1, shown: 0 };
      if (cur.lift + 1 < film.lifts.length) return { lift: cur.lift + 1, beat: 0, shown: 0 };
      return 'end';
    });
  }, [beats, film.lifts.length]);

  // The clock: words type at reading pace, files a few lines at a time, a grey flag waits.
  useEffect(() => {
    if (paused || pos === 'end' || flagged || !beat || !lift) return;
    let wait = 60;
    let next: () => void = advance;
    if (beat.kind === 'say') {
      if (pos.shown < beat.text.length) {
        wait = 40;
        next = () => setPos({ ...pos, shown: pos.shown + Math.max(2, Math.round(3 * speed)) });
      } else wait = 900 / speed;
    } else if (beat.kind === 'act') wait = 1100 / speed;
    else if (beat.kind === 'file' && file) {
      const total = file.text ? file.text.split('\n').length : 0;
      const step = Math.max(1, Math.ceil((total / 40) * speed));
      if (pos.shown < total) {
        wait = 160 / speed + (pos.shown === 0 ? 700 : 0);
        next = () => setPos({ ...pos, shown: Math.min(total, pos.shown + step) });
      } else wait = 1200 / speed;
    } else if (beat.kind === 'checked') wait = 2600 / speed;
    const t = setTimeout(next, wait);
    return () => clearTimeout(t);
  }, [pos, paused, speed, flagged, beat, lift, file, advance]);

  // What stands: everything before this lift, and this lift's files typed so far.
  const done = pos === 'end' ? film.lifts.length : pos.lift;
  const laid = useMemo(() => {
    const s = laidUpTo(film, done);
    if (lift && pos !== 'end') {
      const bs = beats[pos.lift]!;
      for (const b of bs.slice(0, pos.beat + 1))
        if (b.kind === 'file') s.add(lift.files[b.index]!.path);
      if (beat?.kind === 'checked') for (const f of lift.files) s.add(f.path);
    }
    return s;
  }, [film, done, lift, pos, beats, beat]);
  const plots = useMemo(() => {
    const o = litUpTo(film, done);
    if (lift && pos !== 'end') {
      const written = beats[pos.lift]!.slice(0, pos.beat + 1).some(
        (b) => b.kind === 'file' && lift.files[b.index]!.tables.some((t) => t.writes),
      );
      if (written || beat?.kind === 'checked')
        for (const t of lift.tablesLit) o[t] = { lit: true, rows: null };
    }
    return o;
  }, [film, done, lift, pos, beats, beat]);
  const building = file?.building ?? lift?.files.find((f) => f.building)?.building ?? null;
  // The shelf: every part made so far, and every tool the Builder used on the way (its own, not the product).
  const shelf = useMemo(() => {
    const out: (
      | { kind: 'part'; file: FilmFile; lift: FilmLift }
      | { kind: 'act'; tool: string; target: string | null; lift: FilmLift }
    )[] = [];
    film.lifts.forEach((l, li) => {
      const upto =
        pos === 'end' || li < pos.lift ? beats[li]!.length : li === pos.lift ? pos.beat + 1 : 0;
      for (const b of beats[li]!.slice(0, upto)) {
        if (b.kind === 'file') out.push({ kind: 'part', file: l.files[b.index]!, lift: l });
        else if (b.kind === 'act')
          out.push({ kind: 'act', tool: b.tool, target: b.target, lift: l });
      }
    });
    return out.reverse();
  }, [film, beats, pos]);
  const blocks = file && lift ? english(file.path, lift.commit) : null;
  const card = file ? englishOf(blocks, file) : null;
  const sayBeat =
    pos !== 'end'
      ? [...beats[pos.lift]!.slice(0, pos.beat + 1)].reverse().find((b) => b.kind === 'say')
      : undefined;
  const words =
    beat?.kind === 'say'
      ? beat.text.slice(0, pos === 'end' ? undefined : pos.shown)
      : sayBeat?.kind === 'say'
        ? sayBeat.text
        : (lift?.said?.text ?? '');
  const typing = beat?.kind === 'say' && pos !== 'end' && pos.shown < beat.text.length;
  const skip = () =>
    setPos((cur) =>
      cur === 'end'
        ? cur
        : cur.lift + 1 < film.lifts.length
          ? { lift: cur.lift + 1, beat: 0, shown: 0 }
          : 'end',
    );
  const parts = shelf.filter((x) => x.kind === 'part').length;
  if (!film.lifts.length)
    return (
      <div className="film-canvas film-none">
        Nothing is built yet. When the build starts, every step plays here as it happens.
      </div>
    );
  const who = beat?.kind === 'checked' ? 'The Checker' : 'The Builder';
  const whoSmall =
    beat?.kind === 'checked'
      ? 'House of Rama’s checks · the result, as it is'
      : (beat?.kind === 'say'
            ? beat.source
            : sayBeat?.kind === 'say'
              ? sayBeat.source
              : lift?.said?.source) === 'builder'
        ? `${film.builder === 'claude-code' ? 'Claude Code' : (film.builder ?? 'The Builder')} · its own words`
        : 'what changed, from the record';
  return (
    <div className="film-build">
      <div className="film-strip">
        {film.lifts.map((l, i) => (
          <button
            key={l.commit}
            type="button"
            className={`film-lift${i < done ? ' done' : ''}${i === done && pos !== 'end' ? ' now' : ''}${l.checked && !l.checked.ok ? ' flag' : ''}`}
            onClick={() => setPos({ lift: i, beat: 0, shown: 0 })}
            title={l.subject}
          >
            <i>{i < done ? (l.checked && !l.checked.ok ? '▶' : '✓') : i + 1}</i>
            {l.subject.split(':')[0]}
          </button>
        ))}
        <span className="film-chip">
          {film.builder === 'claude-code'
            ? 'The Builder · Claude Code'
            : film.builder
              ? `The Builder · ${film.builder}`
              : 'The Builder'}
        </span>
      </div>
      <div className="film-build-main">
        {p.street ? (
          <FilmStage
            street={p.street}
            frame={() => ({
              laid,
              live: file?.path ?? null,
              plots,
              flags: pos === 'end' ? p.flags : {},
              agent: building
                ? {
                    building,
                    name: who,
                    vendor:
                      beat?.kind === 'checked'
                        ? 'House of Rama’s checks'
                        : film.builder === 'claude-code'
                          ? 'Claude Code'
                          : (film.builder ?? ''),
                  }
                : null,
              pipes: [],
              highlight: { building },
            })}
          >
            {card && file ? (
              <div className="film-card" key={`${lift?.commit}:${file.path}`}>
                <span className="film-eyebrow">A new part · lift {liftN + 1}</span>
                <h4>{file.path}</h4>
                <p>{card.state === 'none' ? 'Not explained yet.' : card.sentence}</p>
                <div className="row">
                  <span className="film-chip">
                    {file.status === 'added'
                      ? `${file.added.length} new lines`
                      : `${file.added.length} lines changed`}
                  </span>
                  {card.state === 'unconfirmed' ? (
                    <span className="film-chip">Explained · not yet confirmed</span>
                  ) : null}
                  {card.state === 'confirmed' ? (
                    <span className="film-chip">Confirmed by {card.by}</span>
                  ) : null}
                  {file.tables.length ? (
                    <span className="film-chip">
                      {file.tables
                        .map((t) => `${t.writes ? 'writes' : 'reads'} ${t.name}`)
                        .join(' · ')}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {flagged && lift?.checked ? (
              <div className="film-flag" role="alert">
                <div className="film-flagpole">
                  <i /> Grey flag · lift {liftN + 1}
                </div>
                <h3>The checks stopped this lift.</h3>
                <p>
                  <b>What happened:</b> {lift.checked.sentence.replace(/^“[^”]*”: /, '')}
                </p>
                <p>
                  <b>What the Builder does next:</b>{' '}
                  {lift.checked.next ?? 'It fixes this in the next lift.'}
                </p>
                <div className="film-actions">
                  <button type="button" className="film-btn lit" onClick={skip}>
                    Watch the fix
                  </button>
                  <span className="film-chip">
                    A trainer is called only if the Builder cannot fix it
                  </span>
                </div>
              </div>
            ) : null}
          </FilmStage>
        ) : (
          <div className="film-canvas film-none">The Street appears after the first lift.</div>
        )}
        <div className="film-subs">
          <div className="who">
            <span className="film-dot" />
            <b>{who}</b>
            <small>{whoSmall}</small>
          </div>
          <p>
            {beat?.kind === 'checked'
              ? lift?.checked
                ? lift.checked.ok
                  ? 'The checks passed. The gate lets this lift through.'
                  : lift.checked.sentence
                : ''
              : beat?.kind === 'act'
                ? `${words}`
                : words}
            {typing ? <span className="cur" /> : null}
          </p>
        </div>
      </div>
      <div className="film-right">
        <div className="film-code">
          <header>
            <span className={`film-chip${file ? ' ok' : ''}`}>
              {file
                ? 'Being written'
                : pos === 'end'
                  ? 'Built'
                  : beat?.kind === 'act'
                    ? 'The Builder is looking'
                    : 'Waiting'}
            </span>
            <span className="film-path">
              {file?.path ?? (beat?.kind === 'act' ? actWords(beat.tool, beat.target) : '')}
            </span>
            {file?.building ? (
              <span className="in">
                · inside {p.street?.buildings.find((b) => b.id === file.building)?.name}
              </span>
            ) : null}
          </header>
          <pre aria-label="The code being written">
            {file
              ? file.text
                  .split('\n')
                  .slice(0, pos !== 'end' ? Math.max(1, pos.shown) : undefined)
                  .map((line, i) => (
                    <div
                      key={i}
                      className={`ln${file.added.includes(i + 1) ? ' new' : ''}`}
                      data-n={i + 1}
                    >
                      {line || ' '}
                    </div>
                  ))
              : null}
            {file?.cut ? (
              <div className="ln cut">… the rest of this long file is not typed here</div>
            ) : null}
          </pre>
          {file && lift ? (
            <AskBox
              siteId={film.site.id}
              path={file.path}
              commit={lift.commit}
              lines={file.text.split('\n').length}
              open={askOpen}
              setOpen={(o) => {
                setAskOpen(o);
                if (o) setPaused(true);
              }}
              say={p.say}
            />
          ) : null}
        </div>
        <div className="film-shelf">
          <span className="film-eyebrow">
            Parts so far · {parts} file{parts === 1 ? '' : 's'} of your product · and the Builder’s
            own looks around
          </span>
          <div className="list">
            {shelf.slice(0, 40).map((x, i) =>
              x.kind === 'part' ? (
                <div key={`p${i}`} className="film-part">
                  <b>{x.file.path}</b>
                  <span>
                    your product · lift {x.lift.n} ·{' '}
                    {x.file.status === 'added'
                      ? 'new'
                      : x.file.status === 'deleted'
                        ? 'taken away'
                        : 'changed'}
                    {x.file.tables.length
                      ? ` · ${x.file.tables.map((t) => `${t.writes ? 'writes' : 'reads'} ${t.name}`).join(', ')}`
                      : ''}
                  </span>
                </div>
              ) : (
                <div key={`a${i}`} className="film-part act">
                  <span>
                    The Builder {actWords(x.tool, x.target)} · its own tool, not your product
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="film-controls">
        <button type="button" className="film-btn" onClick={() => setPaused(!paused)}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="film-btn"
          onClick={() => setSpeed((x) => Math.max(0.5, x / 1.5))}
        >
          Slower
        </button>
        <button
          type="button"
          className="film-btn"
          onClick={() => setSpeed((x) => Math.min(6, x * 1.5))}
        >
          Faster
        </button>
        <button type="button" className="film-btn" onClick={skip}>
          Next lift
        </button>
        <button
          type="button"
          className="film-btn"
          onClick={() => {
            setPos(film.lifts.length ? { lift: 0, beat: 0, shown: 0 } : 'end');
            setPaused(false);
          }}
        >
          From the start
        </button>
        <span className="film-pace">
          {paused
            ? 'Paused'
            : speed === 1
              ? 'Playing at reading pace'
              : `Playing at ${speed.toFixed(1)}× pace`}{' '}
          ·{' '}
          {pos === 'end'
            ? `built in ${film.lifts.length} lifts`
            : `lift ${pos.lift + 1} of ${film.lifts.length}`}
        </span>
        {pos === 'end' ? (
          <button type="button" className="film-btn lit" onClick={p.onNext}>
            Now try it
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Ask the code: a question about the file on screen, answered from its lines alone. */
function AskBox(props: {
  siteId: string;
  path: string;
  commit: string;
  lines: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  say: (who: string, text: string) => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ q: string; a: string; lines: number[]; said: boolean }[]>(
    [],
  );
  if (!props.open)
    return (
      <div className="film-ask closed">
        <button type="button" className="film-btn" onClick={() => props.setOpen(true)}>
          Ask this file a question
        </button>
      </div>
    );
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/site/${encodeURIComponent(props.siteId)}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: props.path,
          commit: props.commit,
          from: 1,
          to: Math.max(1, Math.min(props.lines, 120)),
          question: q,
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        sentence?: string;
        turn?: { answer: string; lines: number[]; said: boolean };
      };
      const a = j.turn ? j.turn.answer : (j.sentence ?? 'No answer came back.');
      setTurns((t) => [...t, { q, a, lines: j.turn?.lines ?? [], said: j.turn?.said ?? false }]);
      props.say('The code · from its own lines', a);
      setQ('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="film-ask">
      <div className="turns">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="q">{t.q}</div>
            <div className="a">
              {t.a}
              {t.lines.length ? (
                <span className="film-chip">lines {t.lines.join(', ')}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          id="film-ask"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What does this part do?"
          aria-label="Ask this file"
        />
        <button type="submit" className="film-btn" disabled={busy}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
        <button type="button" className="film-btn quiet" onClick={() => props.setOpen(false)}>
          Close
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 5. Try it: the product's own code, run on its real data, step by step, slowed to reading pace.

function TryScene(p: SceneProps) {
  const flows = p.flows;
  const [which, setWhich] = useState(0);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const flow = flows[which];
  useEffect(() => {
    setI(0);
  }, [which]);
  useEffect(() => {
    if (!flow) {
      p.say(
        'The Voice',
        'Nothing has been run yet: the product’s screens have not been photographed with their figures worked out again.',
      );
      return;
    }
    const st = flow.steps[i];
    if (st) p.say('The product · its own code, running', st.sentence);
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1 < flow.steps.length ? x + 1 : x)), 4200);
    return () => clearTimeout(t);
  }, [i, flow, paused]);
  if (!flow)
    return (
      <div className="film-canvas film-none">
        Nothing has run yet. When the product’s screens are photographed, each number is worked out
        again by the product’s own code, and you can watch it here.
      </div>
    );
  const step = flow.steps[i]!;
  // The pipe: from the table the first step reads, to the building of the figure, up to its screen.
  const table = flow.steps.find((s) => s.table)?.table ?? null;
  const fileOf = flow.steps.find((s) => s.kind === 'function')?.file ?? null;
  const b =
    p.street?.buildings.find((x) => fileOf && x.bricks.includes(fileOf)) ??
    p.street?.buildings.find((x) => x.screens.length);
  const pts =
    p.street && b
      ? table
        ? pipeFromTable(p.street, table, b.id, 'decides', true)
        : [
            { gx: b.gx + b.side / 2, gy: b.gy + b.side / 2, z: 0 },
            { gx: b.gx + b.side / 2, gy: b.gy + b.side / 2, z: b.height * 0.8 },
          ]
      : null;
  const short = (v: string | null, n: number) => (v && v.length > n ? `${v.slice(0, n - 1)}…` : v);
  const pipe: FilmPipe | null = pts
    ? {
        points: pts,
        t: flow.steps.length > 1 ? i / (flow.steps.length - 1) : 1,
        label: step.rows ? `${step.rows.count} rows` : short(step.value, 40),
        kind: 'flow',
      }
    : null;
  return (
    <div className="film-two">
      <div className="film-try-main">
        <div className="film-runhead">
          <span className="film-eyebrow">Try it · the product, not the Builder</span>
          <span className="film-chip ok">
            The product’s own code, run on its own data · slowed to reading pace
          </span>
        </div>
        {p.street ? (
          <FilmStage
            street={p.street}
            frame={() => ({
              laid: laidUpTo(p.film, p.film.lifts.length),
              live: step.file,
              plots: Object.fromEntries(
                p.film.design.tables.map((t) => [
                  t.name,
                  {
                    lit: true,
                    rows:
                      t.name === table
                        ? (flow.steps.find((s) => s.rows)?.rows?.count ?? null)
                        : null,
                  },
                ]),
              ),
              flags: p.flags,
              agent: null,
              pipes: pipe ? [pipe] : [],
              highlight: { building: b?.id ?? null, table },
            })}
          />
        ) : null}
        <div className="film-controls">
          <button type="button" className="film-btn" onClick={() => setPaused(!paused)}>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button
            type="button"
            className="film-btn"
            onClick={() => setI((x) => Math.min(flow.steps.length - 1, x + 1))}
          >
            Next step
          </button>
          <button
            type="button"
            className="film-btn"
            onClick={() => {
              setI(0);
              setPaused(false);
            }}
          >
            Run it again
          </button>
          <span className="film-pace">
            Step {i + 1} of {flow.steps.length} ·{' '}
            {flow.full
              ? 'every step has its value'
              : 'some steps ran dry: their values were not recorded'}
          </span>
          <button type="button" className="film-btn lit" onClick={p.onNext}>
            Show me the ground
          </button>
        </div>
      </div>
      <div className="film-list">
        <label className="film-eyebrow" htmlFor="film-which">
          Which number to follow
        </label>
        <select
          id="film-which"
          className="film-select"
          value={which}
          onChange={(e) => setWhich(Number(e.target.value))}
        >
          {flows.map((f, n) => (
            <option key={f.key} value={n}>
              {f.title}
            </option>
          ))}
        </select>
        <div className="film-eyebrow">
          What ran, in order · each step of the product and what it produced
        </div>
        {flow.steps.map((s, n) => (
          <button
            key={n}
            type="button"
            className={`film-trace${n === i ? ' on' : ''}${n < i ? ' done' : ''}`}
            onClick={() => {
              setI(n);
              setPaused(true);
            }}
          >
            <i>{n + 1}</i>
            <span>
              <small>
                {s.file ?? s.label}
                {s.table ? ` · the table ${s.table}` : ''}
              </small>
              <b>{s.sentence}</b>
              <code>
                {s.rows
                  ? `${s.rows.count} rows`
                  : s.value
                    ? s.value.length > 160
                      ? `${s.value.slice(0, 159)}…`
                      : s.value
                    : 'dry: no value was recorded for this step'}
              </code>
              {s.rows ? (
                <small>
                  {s.rows.count} rows · {s.rows.first.slice(0, 2).join(' · ')}
                </small>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 6. The ground: what a database is, how data moves in pipes, and who may change what.

interface GroundPage {
  connected: boolean;
  why?: string;
  count?: string;
  rows?: { columns: string[]; rows: (string | null)[][]; total: number };
}

function GroundScene(p: SceneProps) {
  const tables = p.film.design.tables;
  const [ti, setTi] = useState(0);
  const [k, setK] = useState(0);
  const [page, setPage] = useState<GroundPage | null>(null);
  const t = tables[ti];
  useEffect(() => {
    if (!t) return;
    setPage(null);
    fetch(
      `/api/site/${encodeURIComponent(p.film.site.id)}/ground?table=${encodeURIComponent(t.name)}`,
    )
      .then((r) => r.json())
      .then((j: { page?: GroundPage & { rows?: unknown } }) =>
        setPage((j.page as GroundPage) ?? null),
      )
      .catch(() => setPage({ connected: false, why: 'Rows not connected.' }));
  }, [t, p.film.site.id]);
  const beats = useMemo(
    () => [
      {
        title: 'A database is the ground under the buildings',
        text: tables.length
          ? `It is made of tables. This product has ${tables.length === 1 ? 'one' : tables.length}: ${tables.map((x) => x.name).join(', ')}.`
          : 'This product keeps no table yet.',
      },
      {
        title: 'A table is a sheet',
        text: t
          ? `One row for each thing it keeps; one column for each fact about it. ${t.name} has ${t.columns.length} columns, three of them written by the ground itself: which product, when and by whom.`
          : 'One row per thing, one column per fact.',
      },
      {
        title: 'Data moves only through pipes',
        text: 'A building writes down a pipe into its table; a building reads up a pipe from it. Green pipes write; sand-coloured pipes only read. There is no other way in or out.',
      },
      {
        title: 'Which part may change what',
        text: t
          ? `${t.writers.length ? `Only ${t.writers.map(nameOf(p)).join(' and ')} may write ${t.name}.` : `No building writes ${t.name}.`} ${t.readers.length ? `${t.readers.map(nameOf(p)).join(' and ')} only read${t.readers.length === 1 ? 's' : ''} it.` : 'No other building reads it.'}`
          : '',
      },
      {
        title: 'Nothing is lost',
        text: 'Every row says who wrote it and when. House of Rama’s own record of what was decided and signed is append-only: a correction is a new line, never an edit.',
      },
    ],
    [tables, t, p.street],
  );
  useEffect(() => {
    const b = beats[k];
    if (b) p.say('The Voice', `${b.title}. ${b.text}`);
    const tm = setTimeout(() => setK((x) => Math.min(beats.length - 1, x + 1)), 7000);
    return () => clearTimeout(tm);
  }, [k, beats]);
  if (!t)
    return (
      <div className="film-canvas film-none">
        This product keeps no table yet. When it does, each table is a plot in the ground, and opens
        here.
      </div>
    );
  const pipes: FilmPipe[] = [];
  if (p.street && k >= 2) {
    for (const w of t.writers) {
      const pts = pipeFromTable(p.street, t.name, w, 'remembers', false);
      if (pts) pipes.push({ points: pts, t: null, label: null, kind: 'write' });
    }
    for (const r of t.readers) {
      const pts = pipeFromTable(p.street, t.name, r, 'decides', false);
      if (pts) pipes.push({ points: pts, t: null, label: null, kind: 'read' });
    }
  }
  const cols = t.columns;
  return (
    <div className="film-two">
      <div className="film-ground-main">
        {p.street ? (
          <FilmStage
            street={p.street}
            onPick={(x) => {
              if (x && 'table' in x) {
                const n = tables.findIndex((y) => y.name === x.table);
                if (n >= 0) setTi(n);
              }
            }}
            frame={() => ({
              laid: laidUpTo(p.film, p.film.lifts.length),
              live: null,
              plots: Object.fromEntries(
                tables.map((x) => [
                  x.name,
                  {
                    lit: x.name === t.name,
                    rows: x.name === t.name && page?.rows ? page.rows.total : null,
                  },
                ]),
              ),
              flags: {},
              agent: null,
              pipes,
              highlight: { table: t.name, building: null },
            })}
          />
        ) : null}
        <div className="film-slab">
          <div className="ttl">
            <b>{t.name}</b>
            <span>{page?.connected ? page.count : (page?.why ?? 'Reading the rows…')}</span>
          </div>
          <div
            className="film-grid"
            style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 8)}, minmax(0, 1fr))` }}
          >
            {cols.slice(0, 8).map((c) => (
              <div key={c.name} className="cell h">
                <b>
                  {c.from === 'provenance'
                    ? ((
                        {
                          site_id: 'which product',
                          created_at: 'written when',
                          created_by: 'written by',
                        } as Record<string, string>
                      )[c.name] ?? c.name)
                    : c.key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}
                </b>
                <small>
                  {c.name} · {c.type}
                </small>
              </div>
            ))}
            {page?.connected && page.rows
              ? page.rows.rows.slice(0, 6).flatMap((r, ri) =>
                  cols.slice(0, 8).map((c) => {
                    const j = page.rows!.columns.indexOf(c.name);
                    return (
                      <div
                        key={`${ri}:${c.name}`}
                        className={`cell${c.from === 'provenance' ? ' by' : ''}`}
                      >
                        {j >= 0 ? (r[j] ?? '—') : '—'}
                      </div>
                    );
                  }),
                )
              : null}
          </div>
        </div>
      </div>
      <div className="film-list">
        <div>
          <div className="film-eyebrow">The ground · in plain words</div>
          <h2 className="film-h">Where your data lives, and who may touch it.</h2>
        </div>
        {tables.length > 1 ? (
          <select
            className="film-select"
            value={ti}
            onChange={(e) => setTi(Number(e.target.value))}
            aria-label="Which table"
          >
            {tables.map((x, n) => (
              <option key={x.name} value={n}>
                {x.name}
              </option>
            ))}
          </select>
        ) : null}
        {beats.map((b, i) => (
          <button
            key={b.title}
            type="button"
            className={`film-beat${i === k ? ' on' : ''}`}
            onClick={() => setK(i)}
          >
            <i>{i + 1}</i>
            <span>
              <b>{b.title}</b>
              <small>{b.text}</small>
            </span>
          </button>
        ))}
        <div className="film-matrix">
          <div className="hh">part of the product</div>
          <div className="hh">{t.name}</div>
          {[
            ...t.writeFiles.map((f) => [f, 'writes'] as const),
            ...t.readFiles.map((f) => [f, 'reads'] as const),
          ].map(([f, w]) => (
            <div key={f} className="row">
              <span className="film-path">{f}</span>
              <span className={w === 'writes' ? 'W' : 'R'}>{w}</span>
            </div>
          ))}
        </div>
        <div className="film-actions">
          <button type="button" className="film-btn lit" onClick={p.onNext}>
            Walk through it
          </button>
        </div>
      </div>
    </div>
  );
}

const nameOf = (p: SceneProps) => (id: string) =>
  p.street?.buildings.find((b) => b.id === id)?.name ?? id;

// ---------------------------------------------------------------------------------------------------
// 7. Walk through: the real screens, their figures traced, and the signatures by name.

function WalkScene(p: SceneProps) {
  const screens = Object.entries(p.facades).flatMap(([b, fs]) =>
    fs.map((f) => ({ building: b, ...f })),
  );
  useEffect(() => {
    p.say(
      'The Voice',
      `${screens.length} screen${screens.length === 1 ? '' : 's'}, photographed as they really are. Walk through each and say yes when it is right.`,
    );
  }, []);
  return (
    <div className="film-two">
      <div className="film-shots">
        {screens.map((s) => (
          <figure key={s.screen} className="film-shot">
            <header>
              <span className={`film-chip${p.flags[s.building]?.good ? ' ok' : ''}`}>
                {p.flags[s.building]?.word ?? 'Not checked'}
              </span>
              <b>{s.title}</b>
              <small>{p.street?.buildings.find((b) => b.id === s.building)?.name}</small>
            </header>
            {s.shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.shot} alt={`The screen ${s.title}, photographed`} />
            ) : (
              <div className="film-none">Not photographed yet.</div>
            )}
            <figcaption>
              {s.figures.map((f) => (
                <span key={f.key} className={`film-chip${f.traced ? ' ok' : ''}`}>
                  {f.text} · {f.traced ? 'traced' : 'untraced'}
                </span>
              ))}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="film-list">
        <div>
          <div className="film-eyebrow">Walk through · the last act</div>
          <h2 className="film-h">Each screen, read aloud. Say yes to each.</h2>
        </div>
        {screens.map((s) => {
          const sig = p.signed.find((x) => x.screen === s.screen);
          return (
            <div key={s.screen} className={`film-sig${sig ? ' signed' : ''}`}>
              <div>
                <b>{s.title}</b>
                <small>
                  {sig
                    ? `“${sig.statement}” · ${sig.person} · ${new Date(sig.at).toLocaleString('en-IN')}`
                    : 'Not signed yet.'}
                </small>
              </div>
              {sig?.seal ? (
                <span className="film-seal">sealed · {sig.seal.slice(0, 6)}…</span>
              ) : null}
            </div>
          );
        })}
        <div className="film-actions">
          <a
            className="film-btn lit"
            href={`/site/${encodeURIComponent(p.film.site.id)}/walkthrough`}
          >
            Walk through and sign
          </a>
        </div>
        <div className="film-note">
          Then the Checker, from another company, flies the site and signs its own report. Then Hand
          over: the product and its signed trail are yours.
        </div>
      </div>
    </div>
  );
}
