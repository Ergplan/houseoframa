'use client';
// The Street, the home of a site (Stage 8): one building per thing the product does on the lakefront, in
// the customer's words. Click a building to choose it (it becomes the folder, the one green object);
// click it again, or say "open", to go in. Play replays the lifts with the crane at the building being
// built; "Fly the audit" sends the drones building by building and their badges stay. A figure's flow
// whose trail crosses buildings (`?flow=`) runs along the roads, a step a second. Everything drawn is
// also written below the picture, so the Street reads without it.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuditView } from '@rama/audit/view';
import type { BuildingState } from '@rama/blueprint/metrics';
import type { Flow } from '@rama/trace';
import {
  buildingFaces,
  buildingVerdicts,
  drawPipes,
  drawStreet,
  flowAt,
  streetPipes,
  orientStreet,
  unview,
  viewTransform,
  type Camera,
  type CameraAction,
  finishAudit,
  hourOf,
  liftChip,
  pickStreet,
  startAudit,
  stepAudit,
  streetAuditScript,
  streetTimeline,
  toPicture,
  type AuditRun,
  type History,
  type LogEntry,
  type Street,
  type StreetBuilding,
} from '@rama/stage';
import { StateChip } from '../harmony/ui';
import { DraftState } from '../audit/ConfirmReport';
import { usePalette, useImages, useReducedMotion } from './live';
import { placeHref } from './places';
import { Words } from './Words';
import { CameraRing } from './CameraRing';
import { FlowPanel } from './FlowPanel';
import { TURN_MS, useCamera } from './useCamera';

const PER_SECOND = 0.35; // progress through one lift per second

export interface StreetProps {
  siteId: string;
  name: string;
  street: Street;
  flags: Record<string, BuildingState>;
  history: History;
  audit: AuditView | null;
  selected: string | null;
  /** True when every name came from the product's own features file. */
  named: boolean;
  problem: string | null;
  unknownScreens: string[];
  /** The camera the page opened with (from the address). */
  camera: Camera;
  /** Stage 11: each traced figure's flow, by appearance key, with the building whose glass shows it. */
  flows?: Record<string, { flow: Flow; shownIn: string }>;
  /** A figure's flow to play along the roads on arrival (`?flow=`). */
  initialFlow?: string | null;
}

/** What a building keeps and talks to, in words. */
function keeps(b: StreetBuilding): string[] {
  return b.tables.map(
    (t) => `${t.writes && t.reads ? 'Reads and writes' : t.writes ? 'Writes' : 'Reads'} ${t.name}`,
  );
}

export function flagSentence(f: BuildingState): string {
  if (f.state === 'Confirmed') return `Confirmed by ${f.by.join(', ')}. ${f.why}`;
  if (f.state === 'Verified') return `Verified. ${f.why}`;
  return `Unverified. ${f.why}`;
}

export function StreetView(p: StreetProps) {
  const router = useRouter();
  const pal = usePalette();
  const { image, version } = useImages();
  const reduced = useReducedMotion();
  // Zooming with nothing pointed at goes onto the chosen building: by the ring, the keys or the voice.
  const chosenRef = useRef<string | null>(p.selected);
  const {
    cam,
    act: camAct,
    turning,
  } = useCamera(p.siteId, p.camera, (a) =>
    a.type === 'zoom' && a.over === undefined
      ? { ...a, over: chosenRef.current ? { building: chosenRef.current } : null }
      : a,
  );
  const camRef = useRef(cam);
  camRef.current = cam;
  // The Street from the camera's side: its world turned before it is drawn, so draw and pick agree.
  const s = useMemo(() => orientStreet(p.street, cam.orientation), [p.street, cam.orientation]);
  const timeline = useMemo(() => streetTimeline(p.history, s), [p.history, s]);
  const lifts = timeline.lifts.length;
  const [k, setK] = useState(lifts);
  const [prog, setProg] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(p.selected);
  chosenRef.current = selected;
  const [hover, setHover] = useState<{
    id: string | null;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [mode, setMode] = useState<'off' | 'flying' | 'done'>('off');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<AuditRun | null>(null);
  const live = useRef({ k, prog, playing, selected, hover: hover?.id ?? null });
  live.current = { k, prog, playing, selected, hover: hover?.id ?? null };
  // A flow along the roads (Stage 11): drawn over the Street every frame, the page changing only when
  // the water reaches the next step.
  const [flowKey, setFlowKey] = useState<string | null>(p.initialFlow ?? null);
  const [flowMs, setFlowMs] = useState(0);
  const [flowing, setFlowing] = useState(false);
  const flowClock = useRef({ start: 0, ms: 0, on: false });
  const across = flowKey ? (p.flows?.[flowKey] ?? null) : null;
  const pipes = useMemo(() => {
    if (!across) return null;
    const owner = new Map(s.buildings.flatMap((b) => b.bricks.map((x) => [x, b.id] as const)));
    return streetPipes(s, across.flow, (f) => owner.get(f) ?? null, across.shownIn);
  }, [across, s]);
  const water = across && pipes ? flowAt(across.flow.steps.length, flowMs) : null;
  const playFlow = (from: number) => {
    flowClock.current = { start: performance.now() - from, ms: from, on: true };
    setFlowMs(from);
    setFlowing(true);
  };
  const holdFlow = (ms: number) => {
    flowClock.current = { ...flowClock.current, ms, on: false };
    setFlowMs(ms);
    setFlowing(false);
  };
  // Arriving with a flow that crosses buildings: it plays at once.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (pipes) playFlow(0);
  });
  // Each step's sentence is handed to the voice as builder text, once, as the water reaches it.
  const told = useRef(-1);
  useEffect(() => {
    if (!across || !water || water.step === told.current) return;
    told.current = water.step;
    window.dispatchEvent(
      new CustomEvent('rama:tell', { detail: { figure: across.flow.key, step: water.step } }),
    );
  }, [across, water]);
  const flags = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(p.flags).map(([id, f]) => [id, { state: f.state, by: f.by }]),
      ),
    [p.flags],
  );

  // Where a drone hovers over a file: above the roof of the building that holds it.
  const boxOf = useMemo(() => {
    const owner = new Map(s.buildings.flatMap((b) => b.bricks.map((x) => [x, b] as const)));
    return (path: string) => {
      const b = owner.get(path);
      if (!b) return undefined;
      const top = buildingFaces(s, b).top;
      const xs = top.map((q) => q.x);
      return {
        x: Math.min(...xs),
        y: Math.min(...top.map((q) => q.y)) - 30,
        w: Math.max(...xs) - Math.min(...xs),
      };
    };
  }, [s]);

  useEffect(() => {
    if (!pal) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Wall-clock pace even when frames are slow (a busy laptop): a frame may carry up to a quarter second.
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const st = live.current;
      if (st.playing) {
        let nk = st.k;
        let np = st.prog + dt * PER_SECOND * (st.k === 0 ? 3 : 1);
        if (np >= 1) {
          if (nk < lifts) {
            nk += 1;
            np = 0;
          } else {
            np = 1;
            setPlaying(false);
          }
        }
        live.current.k = nk;
        live.current.prog = np;
        setK(nk);
        setProg(np);
      }
      const r = run.current;
      if (r && !r.done) {
        const next = stepAudit(r, reduced ? 1000 : dt, boxOf);
        run.current = next;
        if (next.log.length !== r.log.length) setLog(next.log);
        if (next.done) setMode('done');
      }
      const shown = run.current;
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        const v = viewTransform(camRef.current, s);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = pal.color.canvas;
        ctx.fillRect(0, 0, s.width, s.height);
        ctx.setTransform(v.scale, 0, 0, v.scale, v.dx, v.dy);
        drawStreet(ctx, {
          street: s,
          palette: pal,
          flags,
          selected: st.selected,
          hover: st.hover,
          replay:
            live.current.k >= lifts && live.current.prog >= 1
              ? null
              : { timeline, k: live.current.k, p: live.current.prog },
          image,
          audit:
            shown && p.audit
              ? shown.done
                ? { badges: buildingVerdicts(p.audit.verdicts, s) }
                : {
                    badges: buildingVerdicts(shown.verdicts, s),
                    drones: shown.drones,
                    scan: shown.scan
                      ? {
                          building:
                            s.buildings.find((b) => b.bricks.includes(shown.scan!.path))?.id ?? '',
                          drone: shown.scan.drone,
                        }
                      : null,
                  }
              : null,
          clock: reduced ? 0 : now,
          hour:
            live.current.k >= lifts && live.current.prog >= 1
              ? null
              : hourOf(timeline, live.current.k),
        });
        const fc = flowClock.current;
        if (pipes && across) {
          const steps = across.flow.steps.length;
          if (fc.on) {
            fc.ms = now - fc.start;
            if (fc.ms >= steps * 1000) holdFlow(fc.ms);
            else
              setFlowMs((was) =>
                Math.floor(was / 1000) === Math.floor(fc.ms / 1000) ? was : fc.ms,
              );
          }
          drawPipes(ctx, pipes, pal, flowAt(steps, fc.ms));
        }
      }
      if (!reduced || st.playing || flowClock.current.on || (run.current && !run.current.done))
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setReady(true);
    return () => cancelAnimationFrame(raf);
  }, [
    pal,
    s,
    flags,
    timeline,
    lifts,
    image,
    version,
    p.audit,
    boxOf,
    reduced,
    playing,
    mode,
    selected,
    hover,
    cam,
    pipes,
    across,
    flowing,
  ]);

  const open = (id: string) =>
    router.push(placeHref(p.siteId, { level: 'building', building: id }));
  const flyAudit = () => {
    if (!p.audit) return;
    setPlaying(false);
    setK(lifts);
    setProg(1);
    const top = Math.min(...s.buildings.map((b) => boxOf(b.bricks[0] ?? '')?.y ?? s.height));
    run.current = startAudit(streetAuditScript(p.audit, s), top, s.width);
    setLog([]);
    setMode('flying');
  };
  const stopAudit = () => {
    run.current = null;
    setMode('off');
    setLog([]);
  };
  const skipAudit = () => {
    if (!run.current) return;
    run.current = finishAudit(run.current, boxOf);
    setLog(run.current.log);
    setMode('done');
  };

  // A turn fades from the last frame: it is copied onto the overlay, which then fades out.
  const fade = useRef<HTMLCanvasElement>(null);
  const lastOrientation = useRef(cam.orientation);
  if (lastOrientation.current !== cam.orientation && fade.current && canvas.current) {
    const f = fade.current;
    f.width = canvas.current.width;
    f.height = canvas.current.height;
    f.getContext('2d')?.drawImage(canvas.current, 0, 0);
    f.style.transition = 'none';
    f.style.opacity = '1';
    lastOrientation.current = cam.orientation;
  }
  useEffect(() => {
    const f = fade.current;
    if (!f || !turning) return;
    const id = requestAnimationFrame(() => {
      f.style.transition = `opacity ${reduced ? 0 : TURN_MS}ms ease`;
      f.style.opacity = '0';
    });
    return () => cancelAnimationFrame(id);
  }, [turning, reduced]);

  /** The picture under a pointer, through the camera. */
  const under = (el: HTMLCanvasElement, x: number, y: number) =>
    unview(toPicture(el.getBoundingClientRect(), s, x, y), camRef.current, s);
  const pickAt = (el: HTMLCanvasElement, x: number, y: number) =>
    pickStreet(s, under(el, x, y), k >= lifts && prog >= 1 ? null : { timeline, k, p: prog });
  const act = camAct;
  // The wheel zooms where the pointer is; a native listener, so the page does not scroll under it.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const hit = pickAt(el, e.clientX, e.clientY);
      camAct({
        type: 'zoom',
        factor: e.deltaY < 0 ? 1.15 : 1 / 1.15,
        at: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
        over:
          hit && 'building' in hit
            ? { building: hit.building }
            : hit?.kind === 'plot'
              ? { table: hit.table }
              : null,
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  // A drag sideways turns the picture a quarter.
  const drag = useRef<{ x: number; turned: boolean } | null>(null);

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    const el = e.currentTarget;
    if (click && drag.current?.turned) return;
    const at = under(el, e.clientX, e.clientY);
    const hit = pickStreet(s, at, k >= lifts && prog >= 1 ? null : { timeline, k, p: prog });
    const b = hit && 'building' in hit ? s.buildings.find((x) => x.id === hit.building)! : null;
    if (!click) {
      const text = b
        ? `${b.name}${hit!.kind === 'facade' ? ': its screen behind the glass' : hit!.kind === 'brick' ? ': a part of it, through the glass' : ''}`
        : hit?.kind === 'plot'
          ? `${hit.table}: where the product keeps these records. Click to open the table`
          : hit?.kind === 'jetty'
            ? `${hit.service}: an outside service the product talks to`
            : null;
      setHover(text ? { id: b?.id ?? null, text, x: e.clientX, y: e.clientY } : null);
      el.style.cursor = hit ? 'pointer' : 'default';
      return;
    }
    if (b) {
      if (selected === b.id) open(b.id);
      else setSelected(b.id);
    } else if (hit?.kind === 'plot') {
      // A plot is a real table: the camera dives into the ground and it opens (Stage 11).
      router.push(placeHref(p.siteId, { level: 'ground', table: hit.table }));
    } else setSelected(null);
  };

  const chosen = s.buildings.find((b) => b.id === selected) ?? null;
  const features = s.buildings.filter((b) => b.kind === 'feature');
  const badges =
    p.audit && mode !== 'off'
      ? buildingVerdicts(mode === 'done' ? p.audit.verdicts : (run.current?.verdicts ?? {}), s)
      : {};
  const chip = liftChip(timeline, k);
  // How many facades have their picture up: a test waits on it, and it is true of what is drawn.
  const loaded = s.buildings.filter((b) => {
    const shot = b.facades.find((f) => f.shot)?.shot;
    return shot ? image(shot) !== null : false;
  }).length;
  void version;

  return (
    <div
      className="lakefront"
      data-level="street"
      data-flowing={playing || mode === 'flying' || flowing ? 'true' : 'false'}
    >
      <div className="lake-main">
        <CameraRing cam={cam} act={act} />
        <div className="lake-screen eg-glass">
          <canvas className="lake-fade" ref={fade} aria-hidden />
          <canvas
            ref={canvas}
            width={s.width}
            height={s.height}
            tabIndex={0}
            data-orientation={cam.orientation}
            data-scale={cam.scale}
            onKeyDown={(e) => {
              const a: CameraAction | null =
                e.key === 'ArrowLeft'
                  ? { type: 'turn', by: 'left' }
                  : e.key === 'ArrowRight'
                    ? { type: 'turn', by: 'right' }
                    : e.key === '+' || e.key === '='
                      ? { type: 'zoom', factor: 1.25 }
                      : e.key === '-'
                        ? { type: 'zoom', factor: 0.8 }
                        : null;
              if (a) {
                e.preventDefault();
                act(a);
              }
            }}
            onMouseDown={(e) => (drag.current = { x: e.clientX, turned: false })}
            onMouseUp={(e) => {
              const d = drag.current;
              if (d && Math.abs(e.clientX - d.x) > 80) {
                d.turned = true;
                act({ type: 'turn', by: e.clientX > d.x ? 'left' : 'right' });
              }
              setTimeout(() => (drag.current = null), 0);
            }}
            data-ready={ready && pal ? 'true' : 'false'}
            data-drones={mode}
            data-facades={loaded}
            aria-label={`The Street of ${p.name}: ${features.length} buildings, one for each thing it does. Every building is listed below the picture.`}
            onMouseMove={(e) => onPointer(e, false)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => onPointer(e, true)}
            onDoubleClick={(e) => {
              const hit = pickStreet(s, under(e.currentTarget, e.clientX, e.clientY));
              if (hit && 'building' in hit) open(hit.building);
            }}
          />
          {hover ? (
            <div className="lake-tip" style={{ left: hover.x + 14, top: hover.y - 30 }}>
              {hover.text}
            </div>
          ) : null}
        </div>
        <div className="lake-deck rama-row">
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => {
              if (!playing && k >= lifts && prog >= 1) {
                setK(0);
                setProg(0);
              }
              stopAudit();
              setPlaying(!playing);
            }}
            disabled={lifts === 0}
          >
            {playing ? 'Pause' : 'Play the building'}
          </button>
          <div
            className="eg-track lake-track"
            style={{
              ['--value' as string]: `${lifts ? (Math.max(0, k - 1 + prog) / lifts) * 100 : 100}%`,
            }}
          >
            <div className="eg-track__rail" aria-hidden>
              <div className="eg-track__fill" />
              <div className="eg-track__marker" />
            </div>
            <div className="eg-track__labels">
              <span>
                Empty ground<small>before the first lift</small>
              </span>
              <span>
                Today<small>{lifts} lifts</small>
              </span>
            </div>
          </div>
          {chip ? (
            <span className="eg-chip lake-live" aria-live="polite">
              {playing ? <span className="eg-dot eg-dot--live" aria-hidden /> : null}
              {chip}
            </span>
          ) : null}
          {p.audit ? (
            mode === 'off' ? (
              <button type="button" className="eg-btn eg-btn--sm" onClick={flyAudit}>
                Fly the audit
              </button>
            ) : (
              <>
                {mode === 'flying' ? (
                  <button type="button" className="eg-btn eg-btn--sm" onClick={skipAudit}>
                    Skip to the end
                  </button>
                ) : null}
                <button
                  type="button"
                  className="eg-btn eg-btn--ghost eg-btn--sm"
                  onClick={stopAudit}
                >
                  Put the drones away
                </button>
              </>
            )
          ) : (
            <span className="eg-muted">No audit yet: the drones fly once the audit is called.</span>
          )}
        </div>
        <Words
          siteId={p.siteId}
          here={{ level: 'street', selected }}
          buildings={s.buildings.map((b) => ({ id: b.id, name: b.name }))}
          tables={s.plots.map((x) => ({ name: x.table, by: [...x.writtenBy, ...x.readBy] }))}
        />
        {across && water ? (
          <div data-street-flow={across.flow.key}>
            <FlowPanel
              flow={across.flow}
              step={water.step}
              playing={flowing}
              done={water.done}
              onPlay={() => playFlow(water.done ? 0 : flowMs)}
              onPause={() => holdFlow(flowClock.current.ms)}
              onStep={(by) =>
                holdFlow(
                  Math.max(0, Math.min(across.flow.steps.length - 1, water.step + by)) * 1000 + 999,
                )
              }
              onClose={() => {
                holdFlow(0);
                setFlowKey(null);
              }}
            />
          </div>
        ) : across ? (
          <p className="eg-muted" data-street-flow-home={across.flow.key}>
            The flow of {across.flow.title} stays inside one building.{' '}
            <Link
              href={`${placeHref(p.siteId, { level: 'building', building: across.shownIn })}&flow=${encodeURIComponent(across.flow.key)}`}
            >
              Watch it there
            </Link>
            .
          </p>
        ) : null}
        {mode !== 'off' ? (
          <section
            className="eg-glass rama-card lake-log"
            aria-label="What the auditor is doing"
            data-audit={mode}
          >
            <div className="eg-overline">The audit</div>
            {p.audit && p.audit.narration.length ? (
              <p className="eg-muted" data-narration>
                What the auditor says (in quotation marks) is its own words, not the checks’:{' '}
                <DraftState
                  confirmations={p.audit.confirmations}
                  by={`${p.audit.report.vendor} ${p.audit.report.model}`}
                />
              </p>
            ) : null}
            <ol>
              {log.map((l, i) => (
                <li key={i} className={l.kind}>
                  {l.kind === 'phase' ? (
                    <b>{l.text}</b>
                  ) : l.kind === 'say' ? (
                    <q>{l.text}</q>
                  ) : (
                    l.text
                  )}
                </li>
              ))}
            </ol>
            {mode === 'done' ? (
              <p className="eg-muted">
                The audit’s badges stay on the buildings. What each check found is read in the code.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* One folding side panel over the picture's edge, for the selected thing (Stage 11): the chosen
          building, else the Street; its buildings, ground and water folded inside. */}
      <details
        className="lake-side lake-fold"
        open={chosen ? true : undefined}
        key={chosen?.id ?? 'street'}
      >
        <summary className="lake-fold__head">{chosen ? chosen.name : 'The Street'}</summary>
        <div className="lake-fold__body">
          {chosen ? (
            // The chosen building is the green object on the picture, so its card here is glass.
            <section className="eg-glass rama-card lake-chosen" data-chosen={chosen.id}>
              <div className="eg-card__head">
                <div>
                  <h2 className="eg-card__title">{chosen.name}</h2>
                  <p className="eg-card__sub">
                    {chosen.does ?? 'Nobody has said what it does yet.'}
                  </p>
                </div>
              </div>
              <div>
                <p>{flagSentence(p.flags[chosen.id]!)}</p>
                {chosen.screens.length ? (
                  <p>
                    {chosen.screens.length} screen{chosen.screens.length === 1 ? '' : 's'}
                    {chosen.facades.some((f) => f.shot) ? '' : ', not photographed yet'}.
                  </p>
                ) : null}
                {keeps(chosen).map((t) => (
                  <p key={t}>{t}.</p>
                ))}
                {chosen.services.length ? <p>Talks to {chosen.services.join(', ')}.</p> : null}
                {badges[chosen.id] ? (
                  <p>
                    The audit: {badges[chosen.id] === 'pass' ? 'passed' : `a ${badges[chosen.id]}`}.
                  </p>
                ) : null}
                <div className="rama-row">
                  <Link
                    className="eg-btn eg-btn--sm"
                    href={placeHref(p.siteId, { level: 'building', building: chosen.id })}
                  >
                    Open
                  </Link>
                  <Link
                    className="eg-btn eg-btn--ghost eg-btn--sm"
                    href={placeHref(p.siteId, { level: 'code', building: chosen.id })}
                  >
                    Show me the code
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="eg-glass rama-card">
              <div className="eg-overline">The Street</div>
              {features.length ? (
                <p>
                  {features.length} building{features.length === 1 ? '' : 's'}, one for each thing{' '}
                  {p.name} does. Choose one to see what it does; open it to see its screens.
                </p>
              ) : (
                <p>Nothing is built yet: the buildings rise as the builder lays them.</p>
              )}
              {!p.named ? (
                <p className="eg-muted">
                  {p.problem
                    ? `The names could not be read (${p.problem}), so they are drafted from the screens.`
                    : 'These names are drafted from the screens; nobody has named them yet.'}
                </p>
              ) : null}
              {p.unknownScreens.length ? (
                <p className="eg-muted">
                  Named but not found among the screens: {p.unknownScreens.join(', ')}.
                </p>
              ) : null}
            </section>
          )}

          <section className="eg-glass rama-card">
            <div className="eg-overline">Buildings</div>
            <ol className="lake-list">
              {s.buildings.map((b) => (
                <li key={b.id} data-building={b.id} className={selected === b.id ? 'on' : ''}>
                  <button
                    type="button"
                    className="lake-name"
                    onClick={() => setSelected(b.id)}
                    aria-pressed={selected === b.id}
                  >
                    {b.name}
                  </button>
                  <StateChip
                    state={p.flags[b.id]!.state}
                    by={p.flags[b.id]!.state === 'Confirmed' ? p.flags[b.id]!.by.join(', ') : null}
                  />
                  {badges[b.id] ? (
                    <span
                      className={`eg-chip eg-chip--${badges[b.id] === 'defect' ? 'negative' : badges[b.id] === 'note' ? 'warning' : 'accent'}`}
                      data-badge={badges[b.id]}
                    >
                      {badges[b.id] === 'defect'
                        ? 'Defect'
                        : badges[b.id] === 'note'
                          ? 'Note'
                          : 'Passed'}
                    </span>
                  ) : null}
                  <small className="lake-does">
                    {b.does ?? 'Nobody has said what it does yet.'}
                  </small>
                </li>
              ))}
            </ol>
          </section>

          <section className="eg-glass rama-card">
            <div className="eg-overline">The ground</div>
            {s.plots.length ? (
              <ul className="lake-facts">
                {s.plots.map((pl) => (
                  <li key={pl.table} data-plot={pl.table}>
                    <Link href={placeHref(p.siteId, { level: 'ground', table: pl.table })}>
                      <b>{pl.table}</b>
                    </Link>
                    :{' '}
                    {pl.readBy.length + pl.writtenBy.length
                      ? [
                          pl.writtenBy.length ? `written by ${names(s, pl.writtenBy)}` : null,
                          pl.readBy.length ? `read by ${names(s, pl.readBy)}` : null,
                        ]
                          .filter(Boolean)
                          .join('; ')
                      : 'no building reads or writes it yet'}
                    .
                  </li>
                ))}
              </ul>
            ) : (
              <p className="eg-muted">The product keeps no records of its own yet.</p>
            )}
            <div className="eg-overline">Across the water</div>
            {s.jetties.length ? (
              <ul className="lake-facts">
                {s.jetties.map((j) => (
                  <li key={j.service} data-jetty={j.service}>
                    <b>{j.service}</b>, talked to by {names(s, j.users)}.
                  </li>
                ))}
              </ul>
            ) : (
              <p className="eg-muted">It talks to no outside service.</p>
            )}
            {s.notDrawn ? (
              <p className="eg-muted">
                {s.notDrawn} file{s.notDrawn === 1 ? ' is' : 's are'} not drawn on the Street:
                tests, documents and settings. They are in the code.
              </p>
            ) : null}
          </section>
        </div>
      </details>
    </div>
  );
}

function names(s: Street, ids: string[]): string {
  return ids.map((id) => s.buildings.find((b) => b.id === id)?.name ?? id).join(', ');
}
