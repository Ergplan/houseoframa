'use client';
// The site: the building on a canvas, the replay deck under it, and the inspector beside it.
// Opens on the finished building so every brick can be inspected at once; Play replays the lifts.
// Interaction ported from the weekend prototype (reference/weekend-prototype/house-of-rama.html,
// "loop", "deck" and "picking").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Blueprint } from '@rama/shared';
import { draw } from '../../canvas/draw';
import { siteModel } from '../../canvas/frame';
import { layerColor } from '../../canvas/palette';
import { pick, toScene } from '../../canvas/pick';
import { brickState, clockText, currentTime } from '../../canvas/timeline';
import {
  Inspector,
  type CapturedScreen,
  type ScreenStates,
  type View,
} from '../inspector/Inspector';
import { auditScript, type AuditView } from '@rama/audit/view';
import {
  finishAudit,
  startAudit,
  stepAudit,
  type AuditRun,
  type LogEntry,
} from '../../canvas/audit';

const SPEEDS = [1, 2, 4] as const;
const PER_SECOND = 0.22; // progress through one lift per second at 1×

export function SiteView({
  siteId,
  name,
  blueprint,
  member,
  captured = [],
  signedScreens = [],
  screenStates,
  initialBrick = null,
  audit = null,
}: {
  siteId: string;
  name: string;
  blueprint: Blueprint;
  member: string | null;
  /** Screens photographed from the target's app (Stage 3), for the brick's On screen thumbnails. */
  captured?: CapturedScreen[];
  /** Screens with a signature in force at the Blueprint's commit: their code bricks' dots turn green. */
  signedScreens?: string[];
  /** The screens in the three words, for the trust report (Invariant 11). */
  screenStates?: ScreenStates;
  /** A brick to open on arrival (`?brick=`), as a decision card's link does. */
  initialBrick?: string | null;
  /** The site's latest audit (Stage 5), or null when it has none. */
  audit?: AuditView | null;
}) {
  const router = useRouter();
  const { scene, timeline } = siteModel(blueprint);
  const lifts = timeline.lifts.length;
  const [k, setK] = useState(lifts);
  const [p, setP] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [links, setLinks] = useState(false);
  const [fit, setFit] = useState(true);
  const opening =
    initialBrick && blueprint.nodes.some((n) => n.path === initialBrick) ? initialBrick : null;
  const [selection, setSelection] = useState<string | null>(opening);
  const [hover, setHover] = useState<{ path: string; x: number; y: number; label: string } | null>(
    null,
  );
  const [view, setView] = useState<View>(
    opening ? { kind: 'brick', path: opening } : { kind: 'report' },
  );
  // Set once the view is live in the browser (hydrated and painting), so a test can wait for it.
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ k, p, playing, speed, links, selection, hover: hover?.path ?? null });
  live.current = { k, p, playing, speed, links, selection, hover: hover?.path ?? null };
  // The audit: off, its replay flying (the run lives in a ref, stepped every frame), or done with its
  // badges left on the building. `lit` holds the defects lit by "Light the defects".
  const [auditMode, setAuditMode] = useState<'off' | 'flying' | 'done'>('off');
  const [auditLog, setAuditLog] = useState<LogEntry[]>([]);
  const [speak, setSpeak] = useState(false);
  const [lit, setLit] = useState<string[]>([]);
  const run = useRef<AuditRun | null>(null);
  const auditLive = useRef({ mode: auditMode, speak });
  auditLive.current = { mode: auditMode, speak };
  const glow = useMemo(
    () => new Set<string>([...(selection ? [selection] : []), ...lit]),
    [selection, lit],
  );

  // One animation loop: advances the replay while playing and repaints every frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = live.current;
      if (s.playing) {
        let nk = s.k;
        let np = s.p + dt * PER_SECOND * s.speed * (s.k === 0 ? 3 : 1);
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
        live.current.p = np;
        setK(nk);
        setP(np);
      }
      const r = run.current;
      if (r && !r.done) {
        const next = stepAudit(r, dt * s.speed, (path) => scene.byPath.get(path));
        run.current = next;
        if (next.log.length !== r.log.length) {
          const fresh = next.log.slice(r.log.length);
          setAuditLog(next.log);
          if (auditLive.current.speak) {
            for (const l of fresh)
              if (l.kind === 'say')
                window.speechSynthesis?.speak(new SpeechSynthesisUtterance(l.text));
          }
        }
        if (next.done) setAuditMode('done');
      }
      const shown = run.current;
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        draw(ctx, {
          blueprint,
          commitIndex: live.current.k,
          progress: live.current.p,
          selection: s.selection,
          glow,
          audit:
            shown && audit
              ? shown.done
                ? { verdicts: audit.verdicts }
                : {
                    verdicts: shown.verdicts,
                    drones: shown.drones,
                    scan: shown.scan,
                    label: `AUDIT IN PROGRESS · SECOND OPINION · ${audit.report.vendor.toUpperCase()} ${audit.report.model.toUpperCase()} · COMMIT ${audit.commit.slice(0, 7).toUpperCase()}`,
                  }
              : null,
          hover: s.hover,
          links: s.links,
          clock: now,
          signedScreens,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setReady(true);
    return () => cancelAnimationFrame(raf);
  }, [blueprint, glow, lifts, signedScreens, audit, scene]);

  const startReplay = () => {
    if (!audit) return;
    setPlaying(false);
    setK(lifts);
    setP(1);
    setSelection(null);
    setLit([]);
    // Bricks floor by floor, left to right, as the building lays them.
    const order = (layer: string) =>
      [...scene.byPath.values()]
        .filter((b) => b.layer === layer)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((b) => b.path);
    run.current = startAudit(auditScript(audit, blueprint, order), scene.top, scene.width);
    setAuditLog([]);
    setAuditMode('flying');
    setView({ kind: 'audit' });
  };
  const stopReplay = () => {
    window.speechSynthesis?.cancel();
    run.current = null;
    setAuditMode('off');
    setLit([]);
    setView({ kind: 'report' });
  };
  const skipReplay = () => {
    if (!run.current) return;
    run.current = finishAudit(run.current, (path) => scene.byPath.get(path));
    setAuditLog(run.current.log);
    setAuditMode('done');
  };

  const select = useCallback(
    (path: string) => {
      const laid = timeline.laidIn.get(path);
      if (laid === undefined) return;
      if (brickState(timeline, path, live.current.k, live.current.p) !== 'built') {
        // Jump the replay to the lift that laid it, so the selection is visible.
        setK(laid === -1 ? lifts : laid + 1);
        setP(1);
      }
      setPlaying(false);
      setSelection(path);
      setView({ kind: 'brick', path });
    },
    [timeline, lifts],
  );

  const goTo = (nk: number) => {
    const clamped = Math.max(0, Math.min(lifts, nk));
    setPlaying(false);
    setK(clamped);
    setP(clamped ? 1 : 0);
    setSelection(null);
    setView(clamped ? { kind: 'commit', index: clamped - 1 } : { kind: 'report' });
  };

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    const el = e.currentTarget;
    const { x, y } = toScene(el.getBoundingClientRect(), scene, e.clientX, e.clientY);
    const hit = pick(blueprint, k, p, x, y);
    if (!click) {
      if (hit?.kind === 'brick') {
        const n = blueprint.nodes.find((x) => x.path === hit.path)!;
        setHover({
          path: hit.path,
          x: e.clientX,
          y: e.clientY,
          label: `${hit.path} · ${n.binary ? 'binary' : `${n.lines} lines`}`,
        });
      } else if (hit?.kind === 'door')
        setHover({
          path: '',
          x: e.clientX,
          y: e.clientY,
          label: 'Enter the Showroom · the real UI (Stage 3)',
        });
      else if (hit?.kind === 'office')
        setHover({
          path: '',
          x: e.clientX,
          y: e.clientY,
          label: 'Site office · discovery (Stage 4)',
        });
      else setHover(null);
      el.style.cursor = hit ? 'pointer' : 'crosshair';
      return;
    }
    if (hit?.kind === 'brick') select(hit.path);
    else if (hit?.kind === 'door') router.push(`/site/${siteId}/showroom`);
    else if (hit?.kind === 'office') router.push(`/site/${siteId}/discovery`);
    else {
      setSelection(null);
      setView(k ? { kind: 'commit', index: k - 1 } : { kind: 'report' });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowRight') goTo(live.current.k + 1);
      if (e.key === 'ArrowLeft') goTo(live.current.k - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const time = currentTime(timeline, k, p);
  const [query, setQuery] = useState('');
  const paths = useMemo(() => blueprint.nodes.map((n) => n.path), [blueprint]);

  return (
    <>
      <header className="hud">
        <h1>
          <Link href="/">HOUSE OF RAMA</Link>
        </h1>
        <span className="tag">Built on trust · {name}</span>
        <span className="site">
          {blueprint.repo} @ {blueprint.commit.slice(0, 7) || 'no commit'}
          {blueprint.worktree ? ' + working tree' : ''}
        </span>
      </header>
      <div className="cab">
        <div style={{ minWidth: 0 }}>
          <div className={`screen${fit ? ' fit' : ''}`}>
            <canvas
              ref={canvas}
              width={scene.width}
              height={scene.height}
              data-scene-width={scene.width}
              data-scene-height={scene.height}
              data-ready={ready}
              aria-label={`Construction site of ${name}: ${blueprint.nodes.length} bricks on ${scene.floors.length} floors. Use the brick finder below to inspect any brick from the keyboard.`}
              onMouseMove={(e) => onPointer(e, false)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => onPointer(e, true)}
            />
          </div>
          {hover && (
            <div className="tip" style={{ left: hover.x + 14, top: hover.y - 30 }}>
              {hover.label}
            </div>
          )}
          <div className="deck">
            <div className="row">
              <button
                className="primary"
                onClick={() => {
                  if (!playing && k >= lifts && p >= 1) {
                    setK(0);
                    setP(0);
                  }
                  setSelection(null);
                  setPlaying(!playing);
                }}
              >
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button onClick={() => goTo(k - 1)} disabled={k === 0}>
                ◀ Commit
              </button>
              <button onClick={() => goTo(k + 1)} disabled={k >= lifts}>
                Commit ▶
              </button>
              <button
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
              >
                Speed {speed}×
              </button>
              <button
                className={links ? 'on' : ''}
                onClick={() => setLinks(!links)}
                aria-pressed={links}
              >
                Links: {links ? 'on' : 'off'}
              </button>
              <button
                className={auditMode !== 'off' ? 'on' : ''}
                disabled={!audit}
                title={
                  audit
                    ? `Audit of ${audit.commit.slice(0, 7)} by ${audit.report.vendor} ${audit.report.model}`
                    : 'No audit of this site yet: pnpm rama-audit run <site>'
                }
                onClick={() => (auditMode === 'off' ? startReplay() : stopReplay())}
                aria-pressed={auditMode !== 'off'}
              >
                {auditMode === 'off' ? 'Audit' : '■ Stop audit'}
              </button>
              <button className={fit ? '' : 'on'} onClick={() => setFit(!fit)} aria-pressed={!fit}>
                {fit ? 'Zoom 1:1' : 'Fit'}
              </button>
              <span className="clock">
                {time ? clockText(time) : lifts ? 'before the first commit' : 'no history'}
              </span>
            </div>
            <div className="track" aria-label="Commits">
              <button
                className={k === 0 ? 'cur' : ''}
                title="Cleared site"
                aria-label="Cleared site"
                onClick={() => goTo(0)}
              />
              {timeline.lifts.map((l, i) => (
                <button
                  key={l.sha}
                  title={`${i + 1}. ${l.short} ${l.subject}`}
                  aria-label={`Commit ${i + 1}: ${l.subject}`}
                  className={`${i + 1 < k || (i + 1 === k && p >= 1) ? 'done' : ''} ${i + 1 === k ? 'cur' : ''}`}
                  onClick={() => goTo(i + 1)}
                />
              ))}
            </div>
            <form
              className="finder"
              onSubmit={(e) => {
                e.preventDefault();
                const hit = paths.find((x) => x === query) ?? paths.find((x) => x.includes(query));
                if (query && hit) select(hit);
              }}
            >
              <input
                list="bricks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a brick by path"
                aria-label="Find a brick by path"
              />
              <datalist id="bricks">
                {paths.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <button type="submit">Inspect</button>
            </form>
            <div className="legend">
              {scene.floors.map((f) => (
                <span key={f.id}>
                  <i style={{ background: layerColor(f.id) }} />
                  {f.label.split(' — ')[0]}
                </span>
              ))}
              <span>
                <i style={{ background: '#5ad45a', width: 7, height: 7, borderRadius: '50%' }} />
                On a signed screen
              </span>
              <span>
                <i style={{ background: '#4fe3d8' }} />
                Imports
              </span>
              <span>
                <i style={{ background: '#ffb429' }} />
                Imported by
              </span>
            </div>
          </div>
        </div>
        <Inspector
          siteId={siteId}
          blueprint={blueprint}
          view={view}
          member={member}
          captured={captured}
          signedScreens={signedScreens}
          {...(screenStates ? { screenStates } : {})}
          audit={audit}
          auditRun={{
            mode: auditMode,
            log: auditLog,
            speak,
            onSpeak: (on) => {
              setSpeak(on);
              if (!on) window.speechSynthesis?.cancel();
            },
            onSkip: skipReplay,
            onStop: stopReplay,
            onLight: () =>
              setLit(
                audit
                  ? audit.findings.filter((f) => f.verdict === 'defect').map((f) => f.brick)
                  : [],
              ),
          }}
          onBrick={select}
          onCommit={(i) => goTo(i + 1)}
          onReport={() => {
            setSelection(null);
            setView({ kind: 'report' });
          }}
          onConfirmed={() => router.refresh()}
        />
      </div>
    </>
  );
}
