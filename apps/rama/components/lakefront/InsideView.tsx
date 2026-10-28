'use client';
// The inside (Stage 11): the third level is the same glass building seen from inside, under the same
// camera. Its floors stand one above the other, each brick a glass block on its floor, sized by its lines
// and laid in build order; the deck replays the lifts commit by commit, and the flow's pipes run between
// the bricks. A brick opens to its code in the side panel (the typing view and the English pane), with
// the inspector of Stage 2 under it: the Trust report, a Commit, the Brick in English and Confirm. It
// replaces the Stage 2 brick building.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Blueprint, BrickNode } from '@rama/shared';
import { auditScript, type AuditView, type Verdict } from '@rama/audit/view';
import { brickMarks } from '@rama/blueprint/metrics';
import {
  brickTop,
  drawInside,
  drawnOn,
  drawPipes,
  finishAudit,
  flowAt,
  inside,
  insidePipes,
  pickInside,
  startAudit,
  stepAudit,
  toPicture,
  unview,
  viewTransform,
  type Camera,
  type AuditRun,
  type CameraAction,
  type InsideFloorKind,
  type LogEntry,
} from '@rama/stage';
import type { Flow } from '@rama/trace';
import {
  Inspector,
  type CapturedScreen,
  type ScreenStates,
  type View,
} from '../inspector/Inspector';
import { CameraRing } from './CameraRing';
import { CodePane } from './CodePane';
import { FlowPanel } from './FlowPanel';
import { usePalette } from './live';
import { placeHref } from './places';
import { TURN_MS, useCamera } from './useCamera';
import { Words } from './Words';

export interface InsideProps {
  siteId: string;
  building: { id: string; name: string; bricks: string[] };
  /** The Blueprint, for the inspector (its figures are packages/blueprint/metrics, Invariant 7). */
  blueprint: Blueprint;
  /** Files that render a screen: they stand on the floor of what it shows. */
  screenFiles: string[];
  /** The building each file stands in, so a brick of another building opens there. */
  owners: Record<string, string>;
  all: { id: string; name: string }[];
  camera: Camera;
  member: string;
  initialBrick: string | null;
  captured: CapturedScreen[];
  signedScreens: string[];
  screenStates?: ScreenStates;
  audit: AuditView | null;
  verdicts: Record<string, Verdict>;
  /** Each traced figure's flow, by appearance key, and the file of the screen it is shown on. */
  flows: Record<string, Flow>;
  flowScreens: Record<string, string | null>;
  tableFiles: Record<string, string>;
}

const STEP_MS = 900;

export function InsideView(p: InsideProps) {
  const router = useRouter();
  const pal = usePalette();
  const { cam, act, turning } = useCamera(p.siteId, p.camera);
  const nodes = useMemo(() => new Map(p.blueprint.nodes.map((n) => [n.path, n])), [p.blueprint]);
  const laid = useMemo(() => {
    const index = new Map(p.blueprint.commits.map((c, i) => [c.sha, i]));
    return (path: string) => index.get(nodes.get(path)?.firstCommit ?? '') ?? -1;
  }, [p.blueprint, nodes]);
  const screenFiles = useMemo(() => new Set(p.screenFiles), [p.screenFiles]);
  const drawn = useMemo(() => drawnOn(p.blueprint), [p.blueprint]);
  const [floor, setFloor] = useState<InsideFloorKind | null>(null);
  const sc = useMemo(
    () =>
      inside(
        p.building,
        (path) => nodes.get(path) as BrickNode,
        screenFiles,
        laid,
        cam.orientation,
        drawn,
      ),
    [p.building, nodes, screenFiles, laid, cam.orientation, drawn],
  );
  const lifts = p.blueprint.commits.length;
  const here = new Set(p.building.bricks);
  const start = p.initialBrick && here.has(p.initialBrick) ? p.initialBrick : null;
  const [selected, setSelected] = useState<string | null>(start);
  const [view, setView] = useState<View>(
    start ? { kind: 'brick', path: start } : { kind: 'report' },
  );
  const [k, setK] = useState(lifts);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ path: string; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');

  // The open brick is in the address, so a link or the voice lands on it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('brick', selected);
    else url.searchParams.delete('brick');
    window.history.replaceState(window.history.state, '', url);
  }, [selected]);

  const open = (path: string) => {
    if (!here.has(path)) {
      const owner = p.owners[path];
      if (owner)
        router.push(
          `${placeHref(p.siteId, { level: 'code', building: owner })}&brick=${encodeURIComponent(path)}`,
        );
      return;
    }
    // A brick not laid yet at the lift shown: the replay goes to the lift that laid it.
    const l = laid(path);
    if (l >= 0 && l >= k) setK(l + 1);
    if (l < 0) setK(lifts);
    setPlaying(false);
    setSelected(path);
    setView({ kind: 'brick', path });
  };
  const goTo = (n: number) => {
    const c = Math.max(0, Math.min(lifts, n));
    setPlaying(false);
    setK(c);
    setSelected(null);
    setView(c ? { kind: 'commit', index: c - 1 } : { kind: 'report' });
  };

  // The replay: a lift every STEP_MS while playing.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (k >= lifts) setPlaying(false);
      else {
        setK(k + 1);
        setView({ kind: 'commit', index: k });
      }
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [playing, k, lifts]);

  // The flow of one figure: its pipes between the bricks, the water a step a second.
  const [flowKey, setFlowKey] = useState<string | null>(null);
  const [flowMs, setFlowMs] = useState(0);
  const [flowing, setFlowing] = useState(false);
  // The flows are this commit's re-execution: at an older lift none is offered, since nothing of that
  // commit was recorded (reviewer run 9).
  const atNow = k >= lifts;
  const flow = flowKey && atNow ? (p.flows[flowKey] ?? null) : null;
  const pipes = useMemo(
    () =>
      flow
        ? insidePipes(sc, flow, (t) => p.tableFiles[t] ?? null, p.flowScreens[flow.key] ?? null)
        : null,
    [flow, sc, p.tableFiles, p.flowScreens],
  );
  const water = flow ? flowAt(flow.steps.length, flowMs) : null;
  const waterCanvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const paintWater = (ms: number) => {
    const ctx = waterCanvas.current?.getContext('2d');
    if (!ctx || !pal) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sc.width, sc.height);
    if (!pipes || !flow) return;
    const v = viewTransform(cam, sc);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.dx, v.dy);
    drawPipes(ctx, pipes, pal, flowAt(flow.steps.length, ms));
  };
  useEffect(() => {
    paintWater(clock.current);
    if (!flowing || !flow) return;
    let raf = 0;
    const from = performance.now() - clock.current;
    const tick = (now: number) => {
      const ms = now - from;
      clock.current = ms;
      paintWater(ms);
      const step = Math.floor(ms / 1000);
      setFlowMs((was) => (Math.floor(was / 1000) === step ? was : ms));
      if (ms < flow.steps.length * 1000) raf = requestAnimationFrame(tick);
      else {
        setFlowMs(ms);
        setFlowing(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const told = useRef(-1);
  useEffect(() => {
    if (!flow || !water || water.step === told.current) return;
    told.current = water.step;
    window.dispatchEvent(
      new CustomEvent('rama:tell', { detail: { figure: flow.key, step: water.step } }),
    );
  }, [flow, water]);
  const showFlow = (key: string) => {
    told.current = -1;
    clock.current = 0;
    setFlowKey(key);
    setFlowMs(0);
    setFlowing(true);
  };
  useEffect(() => {
    const on = (e: Event) => {
      if (!atNow) return;
      const name = (e as CustomEvent<string | null>).detail;
      const key = name
        ? Object.keys(p.flows).find((x) => p.flows[x]!.title.toLowerCase() === name.toLowerCase())
        : Object.keys(p.flows)[0];
      if (key) showFlow(key);
    };
    window.addEventListener('rama:flow', on);
    return () => window.removeEventListener('rama:flow', on);
  });

  // While the builder works a lift, the file it is writing glows and grows.
  const [writing, setWriting] = useState<{ path: string; lines: number } | null>(null);
  useEffect(() => {
    let stop = false;
    let since = 0;
    const poll = async () => {
      try {
        const r = (await (await fetch(`/api/site/${p.siteId}/typing?since=${since}`)).json()) as {
          building: boolean;
          edits: { path: string; after: string | null }[];
        };
        since += r.edits.length;
        const mine = r.edits.filter((e) => p.building.bricks.includes(e.path)).at(-1);
        if (mine) setWriting({ path: mine.path, lines: (mine.after ?? '').split('\n').length });
        if (!r.building) setWriting(null);
        if (!stop && r.building) setTimeout(poll, 1000);
      } catch {
        if (!stop) setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [p.siteId, p.building.bricks]);

  // The audit, flown over this building's bricks as it was over the Stage 2 building: two drones beam
  // over one brick at a time and leave its verdict; the log and then the report are in the panel.
  const [auditMode, setAuditMode] = useState<'off' | 'flying' | 'done'>('off');
  const [auditLog, setAuditLog] = useState<LogEntry[]>([]);
  const [speak, setSpeak] = useState(false);
  const [lit, setLit] = useState<string[]>([]);
  const [drones, setDrones] = useState<AuditRun | null>(null);
  const run = useRef<AuditRun | null>(null);
  const speaking = useRef(speak);
  speaking.current = speak;
  const boxOf = (path: string) => {
    const x = sc.bricks.find((b) => b.path === path);
    if (!x) return undefined;
    const t = brickTop(sc, x);
    return { x: t.x - 10, y: t.y, w: 20 };
  };
  const startFlight = () => {
    if (!p.audit) return;
    setPlaying(false);
    setK(lifts);
    setSelected(null);
    setLit([]);
    const order = (layer: string) =>
      sc.bricks.filter((b) => nodes.get(b.path)?.layer === layer).map((b) => b.path);
    run.current = startAudit(auditScript(p.audit, p.blueprint, order), 40, sc.width);
    setAuditLog([]);
    setAuditMode('flying');
    setView({ kind: 'audit' });
  };
  const stopFlight = () => {
    window.speechSynthesis?.cancel();
    run.current = null;
    setDrones(null);
    setAuditMode('off');
    setLit([]);
    setView({ kind: 'report' });
  };
  useEffect(() => {
    if (auditMode !== 'flying') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const r = run.current;
      if (!r) return;
      const next = stepAudit(r, Math.min(0.05, (now - last) / 1000), boxOf);
      last = now;
      run.current = next;
      if (next.log.length !== r.log.length) {
        setAuditLog(next.log);
        if (speaking.current)
          for (const l of next.log.slice(r.log.length))
            if (l.kind === 'say')
              window.speechSynthesis?.speak(new SpeechSynthesisUtterance(l.text));
      }
      setDrones(next);
      if (next.done) setAuditMode('done');
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const links = useMemo(() => {
    if (!selected) return null;
    const edges = p.blueprint.edges;
    return {
      imports: edges.filter((e) => e.from === selected).map((e) => e.to),
      importedBy: edges.filter((e) => e.to === selected).map((e) => e.from),
    };
  }, [selected, p.blueprint.edges]);
  // The green mark on a code brick a named person signed a screen of (packages/blueprint/metrics).
  const signed = useMemo(
    () => new Set(Object.keys(brickMarks(p.blueprint, p.signedScreens))),
    [p.blueprint, p.signedScreens],
  );

  const canvas = useRef<HTMLCanvasElement>(null);
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
      f.style.transition = `opacity ${TURN_MS}ms ease`;
      f.style.opacity = '0';
    });
    return () => cancelAnimationFrame(id);
  }, [turning]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !pal) return;
    const v = viewTransform(cam, sc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.color.canvas;
    ctx.fillRect(0, 0, sc.width, sc.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.dx, v.dy);
    drawInside(ctx, {
      scene: sc,
      palette: pal,
      selected,
      hover: hover?.path ?? null,
      replay: k < lifts ? { k, lifts } : null,
      signed,
      verdicts: auditMode === 'flying' && drones ? drones.verdicts : p.verdicts,
      links,
      writing,
      floor,
      glow: new Set(lit),
      drones: drones && auditMode === 'flying' ? { at: drones.drones, scan: drones.scan } : null,
    });
    setReady(true);
  }, [
    pal,
    sc,
    cam,
    selected,
    hover,
    k,
    lifts,
    signed,
    p.verdicts,
    links,
    writing,
    floor,
    lit,
    drones,
    auditMode,
  ]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      act({
        type: 'zoom',
        factor: e.deltaY < 0 ? 1.15 : 1 / 1.15,
        at: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [act]);
  const drag = useRef<{ x: number; turned: boolean } | null>(null);

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    if (click && drag.current?.turned) return;
    const at = unview(
      toPicture(e.currentTarget.getBoundingClientRect(), sc, e.clientX, e.clientY),
      cam,
      sc,
    );
    const hit = pickInside(sc, at, floor);
    if (!click) {
      setHover(hit?.kind === 'brick' ? { path: hit.path, x: e.clientX, y: e.clientY } : null);
      e.currentTarget.style.cursor = hit?.kind === 'brick' ? 'pointer' : 'default';
      return;
    }
    if (hit?.kind === 'brick') open(hit.path);
    else if (hit?.kind === 'floor') setFloor(hit.floor === floor ? null : hit.floor);
    else {
      setSelected(null);
      setView(k && k < lifts ? { kind: 'commit', index: k - 1 } : { kind: 'report' });
    }
  };

  const node = hover ? nodes.get(hover.path) : null;
  const next = p.all[(p.all.findIndex((b) => b.id === p.building.id) + 1) % p.all.length]!;
  const paths = useMemo(() => p.blueprint.nodes.map((n) => n.path), [p.blueprint]);
  const figuresHere = atNow ? Object.values(p.flows) : [];

  return (
    <div
      className={`lakefront lakefront--inside${selected ? ' lakefront--code' : ''}`}
      data-level="inside"
      data-building={p.building.id}
      data-flowing={flowing ? 'true' : 'false'}
    >
      <div className="lake-main">
        <CameraRing cam={cam} act={act} />
        <div className="lake-screen eg-glass">
          <canvas
            ref={canvas}
            width={sc.width}
            height={sc.height}
            tabIndex={0}
            data-orientation={cam.orientation}
            data-scale={cam.scale}
            data-ready={ready ? 'true' : 'false'}
            aria-label={`Inside ${p.building.name}: ${sc.bricks.length} parts on ${sc.floors.length} floors. Use the finder below the picture to open any part from the keyboard.`}
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
            onMouseMove={(e) => onPointer(e, false)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => onPointer(e, true)}
          />
          <canvas className="lake-fade" ref={fade} aria-hidden />
          <canvas
            className="lake-water"
            ref={waterCanvas}
            width={sc.width}
            height={sc.height}
            aria-hidden
          />
          {hover && node ? (
            <div className="lake-tip" style={{ left: hover.x + 14, top: hover.y - 30 }}>
              {hover.path} · {node.binary ? 'not text' : `${node.lines} lines`}: click to open it
            </div>
          ) : null}
        </div>
        <div className="lake-deck rama-row" aria-label="The lifts">
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => {
              if (!playing && k >= lifts) setK(0);
              setSelected(null);
              setPlaying(!playing);
            }}
          >
            {playing ? 'Pause' : 'Play the lifts'}
          </button>
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => goTo(k - 1)}
            disabled={k === 0}
          >
            Earlier lift
          </button>
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => goTo(k + 1)}
            disabled={k >= lifts}
          >
            Later lift
          </button>
          <span className="eg-muted" data-lift={k}>
            {k === 0
              ? 'Before the first lift'
              : `Lift ${k} of ${lifts}: ${p.blueprint.commits[k - 1]!.subject}`}
          </span>
        </div>
        <div className="rama-row" aria-label="Its floors">
          <button
            type="button"
            className={`eg-btn eg-btn--sm${floor ? ' eg-btn--ghost' : ''}`}
            aria-pressed={!floor}
            onClick={() => setFloor(null)}
          >
            Every floor
          </button>
          {sc.floors.map((f) => (
            <button
              type="button"
              key={f.kind}
              className={`eg-btn eg-btn--sm${floor === f.kind ? '' : ' eg-btn--ghost'}`}
              aria-pressed={floor === f.kind}
              data-floor={f.kind}
              onClick={() => setFloor(floor === f.kind ? null : f.kind)}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>
        <div className="inside-track" aria-label="Commits">
          <button
            type="button"
            className={k === 0 ? 'cur' : ''}
            aria-label="Before the first lift"
            onClick={() => goTo(0)}
          />
          {p.blueprint.commits.map((c, i) => (
            <button
              type="button"
              key={c.sha}
              title={`${i + 1}. ${c.short} ${c.subject}`}
              aria-label={`Commit ${i + 1}: ${c.subject}`}
              className={`${i + 1 <= k ? 'done' : ''} ${i + 1 === k ? 'cur' : ''}`}
              onClick={() => goTo(i + 1)}
            />
          ))}
        </div>
        <form
          className="rama-row"
          onSubmit={(e) => {
            e.preventDefault();
            const hit = paths.find((x) => x === query) ?? paths.find((x) => x.includes(query));
            if (query && hit) open(hit);
          }}
        >
          <input
            className="eg-input"
            list="inside-bricks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a part by its file"
            aria-label="Find a part by its file"
          />
          <datalist id="inside-bricks">
            {paths.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <button type="submit" className="eg-btn eg-btn--sm">
            Open
          </button>
        </form>
        <div className="lake-deck rama-row">
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            disabled={!p.audit}
            aria-pressed={auditMode !== 'off'}
            title={
              p.audit
                ? `Audit of ${p.audit.commit.slice(0, 7)} by ${p.audit.report.vendor} ${p.audit.report.model}`
                : 'There is no audit of this product yet: it is called on the Audit tab'
            }
            onClick={() => (auditMode === 'off' ? startFlight() : stopFlight())}
          >
            {auditMode === 'off' ? 'Fly the audit' : 'Stop the audit'}
          </button>
          <Link
            className="eg-btn eg-btn--sm"
            href={placeHref(p.siteId, { level: 'building', building: p.building.id })}
          >
            Back to the building
          </Link>
          {p.all.length > 1 ? (
            <Link
              className="eg-btn eg-btn--sm"
              data-next
              href={placeHref(p.siteId, { level: 'code', building: next.id })}
            >
              Inside the next building: {next.name}
            </Link>
          ) : null}
          {figuresHere.map((f) => (
            <button
              key={f.key}
              type="button"
              className="eg-btn eg-btn--sm"
              data-show-flow={f.key}
              onClick={() => showFlow(f.key)}
            >
              Show me the flow: {f.title}
            </button>
          ))}
        </div>
        <Words
          siteId={p.siteId}
          here={{ level: 'code', building: p.building.id }}
          buildings={p.all}
        />
      </div>

      <details
        className={`lake-side lake-fold${selected ? ' lake-fold--code' : ''}`}
        open
        key={selected ?? view.kind}
      >
        <summary className="lake-fold__head">
          {selected ?? (view.kind === 'commit' ? `Lift ${view.index + 1}` : p.building.name)}
        </summary>
        <div className="lake-fold__body">
          {flow && water ? (
            <FlowPanel
              flow={flow}
              step={water.step}
              playing={flowing}
              done={water.done}
              onPlay={() => {
                if (water.done) {
                  clock.current = 0;
                  setFlowMs(0);
                }
                setFlowing(true);
              }}
              onPause={() => setFlowing(false)}
              onStep={(by) => {
                setFlowing(false);
                clock.current =
                  Math.max(0, Math.min(flow.steps.length - 1, water.step + by)) * 1000 + 999;
                setFlowMs(clock.current);
              }}
              onClose={() => {
                setFlowing(false);
                setFlowKey(null);
              }}
            />
          ) : null}
          {/* One pane per file: going to another part opens it fresh (reviewer run 8). */}
          {selected ? (
            <CodePane key={selected} siteId={p.siteId} path={selected} member={p.member} />
          ) : null}
          <Inspector
            siteId={p.siteId}
            blueprint={p.blueprint}
            view={view}
            member={p.member}
            captured={p.captured}
            signedScreens={p.signedScreens}
            {...(p.screenStates ? { screenStates: p.screenStates } : {})}
            audit={p.audit}
            auditRun={{
              mode: auditMode,
              log: auditLog,
              speak,
              onSpeak: (on) => {
                setSpeak(on);
                if (!on) window.speechSynthesis?.cancel();
              },
              onSkip: () => {
                if (!run.current) return;
                run.current = finishAudit(run.current, boxOf);
                setAuditLog(run.current.log);
                setDrones(run.current);
                setAuditMode('done');
              },
              onStop: stopFlight,
              onLight: () =>
                setLit(
                  p.audit
                    ? p.audit.findings.filter((f) => f.verdict === 'defect').map((f) => f.brick)
                    : [],
                ),
            }}
            onBrick={open}
            onCommit={(i) => goTo(i + 1)}
            onReport={() => {
              setSelected(null);
              setView({ kind: 'report' });
            }}
            onConfirmed={() => router.refresh()}
          />
        </div>
      </details>
    </div>
  );
}
