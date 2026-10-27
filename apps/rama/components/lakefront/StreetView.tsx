'use client';
// The Street, the home of a site (Stage 8): one building per thing the product does on the lakefront, in
// the customer's words. Click a building to choose it (it becomes the folder, the one green object);
// click it again, or say "open", to go in. Play replays the lifts with the crane at the building being
// built; "Fly the audit" sends the drones building by building and their badges stay. Everything drawn
// is also written below the picture, so the Street reads without it.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuditView } from '@rama/audit/view';
import type { BuildingState } from '@rama/blueprint/metrics';
import {
  buildingFaces,
  buildingVerdicts,
  drawStreet,
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
  const s = p.street;
  const timeline = useMemo(() => streetTimeline(p.history, s), [p.history, s]);
  const lifts = timeline.lifts.length;
  const [k, setK] = useState(lifts);
  const [prog, setProg] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(p.selected);
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
      const dt = Math.min(0.05, (now - last) / 1000);
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
      }
      if (!reduced || st.playing || (run.current && !run.current.done))
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

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    const el = e.currentTarget;
    const at = toPicture(el.getBoundingClientRect(), s, e.clientX, e.clientY);
    const hit = pickStreet(s, at, k >= lifts && prog >= 1 ? null : { timeline, k, p: prog });
    const b = hit && 'building' in hit ? s.buildings.find((x) => x.id === hit.building)! : null;
    if (!click) {
      const text = b
        ? `${b.name}${hit!.kind === 'facade' ? ': its screen behind the glass' : hit!.kind === 'brick' ? ': a part of it, through the glass' : ''}`
        : hit?.kind === 'plot'
          ? `${hit.table}: where the product keeps these records`
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
    <div className="lakefront" data-level="street">
      <div className="lake-main">
        <div className="lake-screen eg-glass">
          <canvas
            ref={canvas}
            width={s.width}
            height={s.height}
            data-ready={ready && pal ? 'true' : 'false'}
            data-drones={mode}
            data-facades={loaded}
            aria-label={`The Street of ${p.name}: ${features.length} buildings, one for each thing it does. Every building is listed below the picture.`}
            onMouseMove={(e) => onPointer(e, false)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => onPointer(e, true)}
            onDoubleClick={(e) => {
              const at = toPicture(
                e.currentTarget.getBoundingClientRect(),
                s,
                e.clientX,
                e.clientY,
              );
              const hit = pickStreet(s, at);
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
        />
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
                    <b>{pl.table}</b>:{' '}
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
