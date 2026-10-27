'use client';
// The Building level (Stage 8): one building, its real screens on the glass front with every figure
// outlined (traced in accent, untraced dashed), its floors through the side: what it shows, decides,
// remembers and who it talks to. Click a figure for its trail, in plain words (the trail is then the one
// green object); click through the glass, or say "show me the code", for the code.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Verdict } from '@rama/audit/view';
import type { BuildingState } from '@rama/blueprint/metrics';
import {
  drawBuilding,
  pickBuilding,
  toPicture,
  type BuildingScene,
  type StreetBuilding,
} from '@rama/stage';
import type { PlainTrail } from '@rama/workbench';
import { Folder, StateChip } from '../harmony/ui';
import { usePalette, useImages } from './live';
import { placeHref } from './places';
import { flagSentence } from './StreetView';
import { Words } from './Words';

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
}

export function BuildingView(p: BuildingProps) {
  const router = useRouter();
  const pal = usePalette();
  const { image, version } = useImages();
  const sc = p.scene;
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
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !pal) return;
    drawBuilding(ctx, {
      scene: sc,
      palette: pal,
      flag: { state: p.flag.state, by: p.flag.by },
      image,
      picked,
      hover: hover?.key ?? null,
      verdicts: p.verdicts,
    });
    setReady(true);
  }, [pal, sc, p.flag, image, version, picked, hover, p.verdicts]);

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
    const at = toPicture(e.currentTarget.getBoundingClientRect(), sc, e.clientX, e.clientY);
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
        <div className="lake-screen eg-glass">
          <canvas
            ref={canvas}
            width={sc.width}
            height={sc.height}
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

      <aside className="lake-side">
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
      </aside>
    </div>
  );
}
