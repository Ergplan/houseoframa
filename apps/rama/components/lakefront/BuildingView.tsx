'use client';
// The Building level (Stage 8): one building, its real screens on the glass front with every figure
// outlined (traced in accent, untraced dashed), its floors through the side: what it shows, decides,
// remembers and who it talks to. Click a figure for its trail, in plain words (the trail is then the one
// green object); click through the glass, or say "show me the code", for the code.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Verdict } from '@rama/audit/view';
import type { BuildingState } from '@rama/blueprint/metrics';
import {
  drawBuilding,
  orientScene,
  pickBuilding,
  toPicture,
  unview,
  viewTransform,
  type BuildingScene,
  type Camera,
  type CameraAction,
  type StreetBuilding,
} from '@rama/stage';
import type { PlainTrail } from '@rama/workbench';
import { Folder, StateChip } from '../harmony/ui';
import { usePalette, useImages } from './live';
import { placeHref } from './places';
import { flagSentence } from './StreetView';
import { Words } from './Words';
import { CameraRing } from './CameraRing';
import { useCamera } from './useCamera';
import { BuildingEnglish } from './BuildingEnglish';

export interface BuildingProps {
  siteId: string;
  building: StreetBuilding;
  scene: BuildingScene;
  flag: BuildingState;
  trails: Record<string, PlainTrail>;
  initialFigure: string | null;
  /** The latest audit's verdict on each of its files. */
  verdicts: Record<string, Verdict>;
  all: { id: string; name: string }[];
  /** The camera the page opened with (from the address). */
  camera: Camera;
}

export function BuildingView(p: BuildingProps) {
  const router = useRouter();
  const pal = usePalette();
  const { image, version } = useImages();
  const { cam, act } = useCamera(p.siteId, p.camera);
  // The building from the camera's side: the screens on whichever face is toward it.
  const sc = useMemo(() => orientScene(p.scene, cam.orientation), [p.scene, cam.orientation]);
  const [picked, setPicked] = useState<string | null>(p.initialFigure);
  // The figure picked is in the address, so the voice's "this number" means the one in front (Stage 10).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (picked) url.searchParams.set('figure', picked);
    else url.searchParams.delete('figure');
    window.history.replaceState(window.history.state, '', url);
  }, [picked]);
  const [hover, setHover] = useState<{
    key: string | null;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  // While the builder works a lift, the file it is writing glows in the building and grows (Stage 11).
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
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !pal) return;
    const v = viewTransform(cam, sc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.color.canvas;
    ctx.fillRect(0, 0, sc.width, sc.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.dx, v.dy);
    drawBuilding(ctx, {
      scene: sc,
      palette: pal,
      flag: { state: p.flag.state, by: p.flag.by },
      image,
      picked,
      hover: hover?.key ?? null,
      verdicts: p.verdicts,
      writing,
    });
    setReady(true);
  }, [pal, sc, p.flag, image, version, picked, hover, p.verdicts, cam, writing]);
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

  const codeHref = (file?: string) =>
    `${placeHref(p.siteId, { level: 'code', building: p.building.id })}${file ? `&brick=${encodeURIComponent(file)}` : ''}`;
  const figures = sc.facades.flatMap((f) => f.figures.map((g) => ({ ...g, screen: f.title })));
  const open = picked ? (figures.find((g) => g.key === picked) ?? null) : null;
  const trail = open && open.traced ? (p.trails[open.key] ?? null) : null;
  // The headline figures: each traced figure once (its first appearance), as Harmony's StatTile.
  const tiles = [
    ...new Map(figures.filter((g) => g.traced && p.trails[g.key]).map((g) => [g.id, g])).values(),
  ]
    .slice(0, 6)
    .map((g) => ({ g, t: p.trails[g.key]! }));

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    if (click && drag.current?.turned) return;
    const at = unview(
      toPicture(e.currentTarget.getBoundingClientRect(), sc, e.clientX, e.clientY),
      cam,
      sc,
    );
    const hit = pickBuilding(sc, at);
    if (!click) {
      const g = hit?.kind === 'figure' ? figures.find((x) => x.key === hit.key) : null;
      const text =
        hit?.kind === 'figure'
          ? `${g?.text ?? 'A figure'}: ${hit.traced ? 'traced, click for where it comes from' : 'untraced'}`
          : hit?.kind === 'brick'
            ? 'A part of this building: click to see its code'
            : hit?.kind === 'facade'
              ? 'The screen, behind the glass'
              : null;
      setHover(
        text
          ? {
              key: hit?.kind === 'figure' ? hit.key : hit?.kind === 'brick' ? hit.path : null,
              text,
              x: e.clientX,
              y: e.clientY,
            }
          : null,
      );
      e.currentTarget.style.cursor = hit ? 'pointer' : 'default';
      return;
    }
    if (hit?.kind === 'figure') setPicked(hit.key);
    else if (hit?.kind === 'brick') router.push(codeHref(hit.path));
    else setPicked(null);
  };

  return (
    <div className="lakefront" data-level="building" data-building={p.building.id}>
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
            data-ready={ready ? 'true' : 'false'}
            aria-label={`${p.building.name}: its screens on the front, its floors through the side. Its figures are listed beside the picture.`}
            onMouseMove={(e) => onPointer(e, false)}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => onPointer(e, true)}
          />
          {hover ? (
            <div className="lake-tip" style={{ left: hover.x + 14, top: hover.y - 30 }}>
              {hover.text}
            </div>
          ) : null}
        </div>
        <div className="lake-deck rama-row">
          <Link
            className="eg-btn eg-btn--sm"
            href={placeHref(p.siteId, { level: 'street', selected: p.building.id })}
          >
            Back to the Street
          </Link>
          {p.all.length > 1 ? (
            <Link
              className="eg-btn eg-btn--sm"
              data-next
              href={placeHref(p.siteId, {
                level: 'building',
                building:
                  p.all[(p.all.findIndex((b) => b.id === p.building.id) + 1) % p.all.length]!.id,
              })}
            >
              Next building:{' '}
              {p.all[(p.all.findIndex((b) => b.id === p.building.id) + 1) % p.all.length]!.name}
            </Link>
          ) : null}
          <Link className="eg-btn eg-btn--sm" href={codeHref()}>
            Show me the code
          </Link>
        </div>
        <Words
          siteId={p.siteId}
          here={{ level: 'building', building: p.building.id }}
          buildings={p.all}
        />
        {tiles.length ? (
          <div className="lake-stats" aria-label="Its traced figures">
            {tiles.map(({ g, t }) => (
              <button
                key={g.key}
                type="button"
                className={`eg-stat${tiles.length === 1 ? ' eg-stat--hero' : ''}`}
                onClick={() => setPicked(g.key)}
                data-stat={g.key}
              >
                <span className="eg-stat__top">
                  <span className="eg-stat__label">{t.title}</span>
                </span>
                <span className="eg-stat__date">{g.screen}</span>
                <span className="eg-stat__value">{g.text ?? g.id}</span>
                <span className="eg-stat__foot">{t.what}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <details className="lake-side lake-fold" open key={open?.key ?? 'building'}>
        <summary className="lake-fold__head">
          {trail && open ? trail.title : p.building.name}
        </summary>
        <div className="lake-fold__body">
          <BuildingEnglish siteId={p.siteId} building={p.building.id} bricks={p.building.bricks} />
          {trail && open ? (
            <Folder title={trail.title} sub={trail.what}>
              <div className="lake-trail eg-on-folder" data-trail={open.key}>
                <p>
                  <b>How it is worked out.</b> {trail.english}
                </p>
                {trail.inputs.length ? (
                  <ul>
                    {trail.inputs.map((x, i) => (
                      <li key={i}>
                        {x.label}: {x.value ?? 'not worked out again'}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {trail.kept.length ? (
                  <p>
                    <b>Where it is kept.</b> {trail.kept.join('; ')}.
                  </p>
                ) : null}
                {trail.again ? (
                  <p>
                    <b>Worked out again.</b>{' '}
                    {trail.again.matches === true
                      ? `The product’s own code gives ${trail.again.computed}, as the screen shows.`
                      : trail.again.matches === false
                        ? `The screen shows ${trail.again.shown}; the product’s own code gives ${trail.again.computed}.`
                        : 'It could not be worked out again.'}
                  </p>
                ) : (
                  <p>It has not been worked out again.</p>
                )}
                {trail.built.length ? (
                  <p>
                    <b>Built.</b>{' '}
                    {trail.built
                      .map(
                        (x) =>
                          `${x.lift ? `Lift ${x.lift}` : 'A lift'} by ${x.by}, ${x.at.slice(0, 10)}: ${x.what}`,
                      )
                      .join('. ')}
                    .
                  </p>
                ) : null}
                <p>
                  <b>Signed.</b>{' '}
                  {trail.signed
                    ? `By ${trail.signed.person}, ${trail.signed.at.slice(0, 10)}.`
                    : 'Nobody has signed this screen yet.'}
                </p>
                <div className="rama-row">
                  <Link className="eg-btn eg-btn--sm" href={codeHref(trail.file)}>
                    Show me the code
                  </Link>
                  <button
                    type="button"
                    className="eg-btn eg-btn--ghost eg-btn--sm"
                    onClick={() => setPicked(null)}
                  >
                    Close the trail
                  </button>
                </div>
              </div>
            </Folder>
          ) : open && !open.traced ? (
            <section className="eg-glass rama-card" data-untraced={open.key}>
              <div className="eg-overline">Untraced</div>
              <p>
                {open.text ?? 'This figure'} on {open.screen}: nobody can say yet where this number
                comes from. It stays untraced until it is mapped to the code that works it out.
              </p>
              <button type="button" className="eg-btn eg-btn--sm" onClick={() => setPicked(null)}>
                Close
              </button>
            </section>
          ) : null}

          <section className="eg-glass rama-card">
            <div className="eg-overline">{p.building.name}</div>
            <p>{p.building.does ?? 'Nobody has said what it does yet.'}</p>
            <p>
              <StateChip
                state={p.flag.state}
                by={p.flag.state === 'Confirmed' ? p.flag.by.join(', ') : null}
              />
            </p>
            <p className="eg-muted">{flagSentence(p.flag)}</p>
          </section>

          {p.building.kind === 'feature' ? (
            <section className="eg-glass rama-card" data-naming={p.building.id}>
              <div className="eg-overline">Its name</div>
              <p className="eg-muted">
                {p.building.confirmed
                  ? `Named by ${p.building.confirmed.by}, ${p.building.confirmed.at.slice(0, 10)}.`
                  : p.building.source === 'draft'
                    ? 'Drafted from its screen; nobody has named it yet.'
                    : 'Written by the builder; nobody has confirmed it yet.'}
              </p>
              <form action={`/api/site/${p.siteId}/features`} method="post" className="rama-form">
                <input type="hidden" name="building" value={p.building.id} />
                <label>
                  Name, in your words
                  <input
                    className="eg-input"
                    name="name"
                    defaultValue={p.building.name}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  What it does, in one sentence
                  <input
                    className="eg-input"
                    name="does"
                    defaultValue={p.building.does ?? ''}
                    maxLength={240}
                  />
                </label>
                <button type="submit" className="eg-btn eg-btn--sm">
                  {p.building.confirmed ? 'Keep these words' : 'Confirm the name'}
                </button>
              </form>
            </section>
          ) : null}

          <section className="eg-glass rama-card">
            <div className="eg-overline">Its screens and figures</div>
            {sc.facades.length === 0 ? (
              <p className="eg-muted">It has no screen of its own.</p>
            ) : null}
            {sc.facades.map((f) => (
              <div key={f.screen} className="lake-facade" data-screen={f.screen}>
                <p>
                  <b>{f.title}</b>
                  {f.shot ? '' : ': not photographed yet'}
                </p>
                {f.figures.length ? (
                  <ul className="lake-figures">
                    {f.figures.map((g) => (
                      <li key={g.key}>
                        <button
                          type="button"
                          className="lake-name"
                          onClick={() => setPicked(g.key)}
                          data-figure={g.key}
                        >
                          {g.text ?? g.id}
                        </button>{' '}
                        <span
                          className={`eg-chip ${g.traced ? 'eg-chip--accent' : 'rama-chip--muted'}`}
                        >
                          {g.traced ? 'Traced' : 'Untraced'}
                        </span>
                        {g.at ? null : (
                          <small className="eg-muted">
                            {' '}
                            lower on the screen than the front shows
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : f.shot ? (
                  <p className="eg-muted">No figures on this screen.</p>
                ) : null}
              </div>
            ))}
          </section>

          <section className="eg-glass rama-card">
            <div className="eg-overline">Its floors</div>
            <ul className="lake-facts">
              {sc.floors.map((f) => (
                <li key={f.kind} data-floor={f.kind}>
                  {f.label}: {f.bricks.length} part{f.bricks.length === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
            {p.building.tables.length ? (
              <p>
                {p.building.tables
                  .map(
                    (t) =>
                      `${t.writes && t.reads ? 'Reads and writes' : t.writes ? 'Writes' : 'Reads'} ${t.name}`,
                  )
                  .join('. ')}
                .
              </p>
            ) : null}
            {p.building.services.length ? <p>Talks to {p.building.services.join(', ')}.</p> : null}
          </section>
        </div>
      </details>
    </div>
  );
}
