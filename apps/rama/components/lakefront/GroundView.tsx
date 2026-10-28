'use client';
// The ground opened (Stage 11): a plot of the Street is a real table, and it fills the stage as a glass
// slab under the same camera (turn, zoom, the breadcrumb Street › the ground › orders). Its columns are
// the Drizzle definition's; its rows are the product's own, read-only, newest first, 50 at a time, the
// count saying what it counts; a secret's values never leave the server. A column a figure on a screen is
// worked out from is marked, and its card leads to that figure's flow. The table is the level itself,
// not a side panel: a click on a cell or a column opens a card on the picture.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  drawGround,
  ground,
  pickGround,
  toPicture,
  unview,
  viewTransform,
  type Camera,
  type CameraAction,
  type GroundInput,
} from '@rama/stage';
import type { GroundTable } from '@rama/workbench';
import type { GroundPage } from '../../app/api/site/[siteId]/ground/handler';
import { usePalette } from './live';
import { placeHref } from './places';
import { Words } from './Words';
import { CameraRing } from './CameraRing';
import { TURN_MS, useCamera } from './useCamera';

export interface GroundProps {
  siteId: string;
  table: GroundTable;
  /** The first page of rows, or why there are none. */
  page: GroundPage;
  camera: Camera;
  all: { id: string; name: string }[];
  tables: { name: string; by: string[] }[];
}

type Spot = { row: number; col: number };

export function GroundView(p: GroundProps) {
  const router = useRouter();
  const pal = usePalette();
  const { cam, act, turning } = useCamera(p.siteId, p.camera);
  const [page, setPage] = useState<GroundPage>(p.page);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<(Spot & { x: number; y: number; text: string }) | null>(null);
  const [chosen, setChosen] = useState<(Spot & { x: number; y: number }) | null>(null);
  const t = p.table;
  const rows = page.connected ? page.rows : null;
  // The columns as the database holds them, in the definition's order; masked ones stay masked.
  const shown = useMemo(
    () => (rows ? rows.columns.map((n) => t.columns.find((c) => c.name === n)!) : t.columns),
    [rows, t],
  );
  const input: GroundInput = useMemo(
    () => ({
      table: t.table,
      columns: shown.map((c) => ({
        name: c.name,
        type: c.type,
        key: c.primary ? 'primary' : c.references ? 'link' : null,
        figure: c.figures.length > 0,
        masked: c.masked,
      })),
      rows: rows?.rows ?? [],
      readBy: t.readBy.map((b) => b.name),
      writtenBy: t.writtenBy.map((b) => b.name),
      note: page.connected ? null : page.why,
    }),
    [t, shown, rows, page],
  );
  const sc = useMemo(() => ground(input, cam.orientation), [input, cam.orientation]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fade = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
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
    drawGround(ctx, {
      scene: sc,
      palette: pal,
      hover: hover ? { row: hover.row, col: hover.col } : null,
      selected: chosen ? { row: chosen.row, col: chosen.col } : null,
    });
    setReady(true);
  }, [pal, sc, cam, hover, chosen]);
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

  const more = async (offset: number) => {
    setBusy(true);
    try {
      const r = (await (
        await fetch(
          `/api/site/${encodeURIComponent(p.siteId)}/ground?table=${encodeURIComponent(t.table)}&offset=${offset}`,
        )
      ).json()) as { ok: boolean; page?: GroundPage; sentence?: string };
      if (r.ok && r.page) {
        setPage(r.page);
        setChosen(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPointer = (e: React.MouseEvent<HTMLCanvasElement>, click: boolean) => {
    if (click && drag.current?.turned) return;
    const at = unview(
      toPicture(e.currentTarget.getBoundingClientRect(), sc, e.clientX, e.clientY),
      cam,
      sc,
    );
    const hit = pickGround(sc, at);
    const spot =
      hit?.kind === 'cell'
        ? { row: hit.row, col: hit.col }
        : hit?.kind === 'column'
          ? { row: -1, col: hit.col }
          : null;
    if (!click) {
      const c = spot ? shown[spot.col]! : null;
      const text = c
        ? spot!.row < 0
          ? `${c.name}: ${c.figures.length ? 'a figure on a screen is worked out from it' : 'a column of the table'}`
          : `${c.name} of this row`
        : hit?.kind === 'pipe'
          ? `${hit.building}: a building that uses this table`
          : null;
      setHover(spot && text ? { ...spot, x: e.clientX, y: e.clientY, text } : null);
      e.currentTarget.style.cursor = hit && hit.kind !== 'slab' ? 'pointer' : 'default';
      return;
    }
    if (hit?.kind === 'pipe') {
      const b = [...t.readBy, ...t.writtenBy].find((x) => x.name === hit.building);
      if (b) router.push(placeHref(p.siteId, { level: 'building', building: b.id }));
      return;
    }
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    setChosen(spot ? { ...spot, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };

  const col = chosen ? shown[chosen.col]! : null;
  const value =
    chosen && col && chosen.row >= 0 ? (rows?.rows[chosen.row]?.[chosen.col] ?? null) : null;
  const flowHref = (f: GroundTable['columns'][number]['figures'][number]) =>
    f.building
      ? `${placeHref(p.siteId, { level: 'building', building: f.building })}&figure=${encodeURIComponent(f.key)}&flow=${encodeURIComponent(f.key)}`
      : null;
  const masked = t.columns.filter((c) => c.masked);

  return (
    <div className="lakefront lakefront--ground" data-level="ground" data-table={t.table}>
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
            data-rows={rows ? rows.rows.length : 0}
            aria-label={`The table ${t.table}, opened: its columns across, its rows down. They are also listed as a table below the picture.`}
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
          {hover ? (
            <div className="lake-tip" style={{ left: hover.x + 14, top: hover.y - 30 }}>
              {hover.text}
            </div>
          ) : null}
          {chosen && col ? (
            <div
              className="eg-glass lake-card"
              role="dialog"
              aria-label={`${col.name}${chosen.row >= 0 ? ' of this row' : ''}`}
              data-card={chosen.row < 0 ? `column:${col.name}` : `cell:${chosen.row}:${col.name}`}
              style={{ left: Math.max(8, chosen.x - 140), top: chosen.y + 16 }}
            >
              <div className="rama-row">
                <b>{col.name}</b>
                {col.words ? <span className="eg-muted">“{col.words}”</span> : null}
                <button
                  type="button"
                  className="eg-btn eg-btn--ghost eg-btn--sm"
                  onClick={() => setChosen(null)}
                >
                  Close
                </button>
              </div>
              {chosen.row >= 0 ? (
                <p className="lake-card__value">
                  {col.masked
                    ? value === null
                      ? 'Empty.'
                      : 'Kept secret: its value is never shown.'
                    : value === null
                      ? 'Empty.'
                      : value}
                </p>
              ) : (
                <p className="eg-muted" style={{ margin: 0 }}>
                  {[
                    col.type === 'unknown' ? 'Its type is not read from the code' : `A ${col.type}`,
                    col.primary ? 'the key of each row' : null,
                    col.notNull && !col.primary ? 'never empty' : null,
                    col.unique ? 'never the same twice' : null,
                    col.references ? `points at ${col.references}` : null,
                    col.from ? `from ${col.from}` : null,
                    col.masked ? 'kept secret: its values are never shown' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  .
                </p>
              )}
              {col.figures.length ? (
                <>
                  <p style={{ margin: 0 }}>
                    {chosen.row >= 0
                      ? 'A figure on a screen is worked out from this column. Its flow shows the values of the run recorded at this commit, not this row’s own.'
                      : 'Figures on screens worked out from this column:'}
                  </p>
                  <ul className="lake-facts">
                    {col.figures.map((f) => (
                      <li key={f.key}>
                        ◆ {f.title}{' '}
                        {flowHref(f) ? (
                          <Link
                            className="eg-btn eg-btn--sm"
                            href={flowHref(f)!}
                            data-flow-link={f.key}
                          >
                            Show me the flow
                          </Link>
                        ) : (
                          <span className="eg-muted">(no building shows it)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="eg-muted" style={{ margin: 0 }} data-dry>
                  No figure on a screen is worked out from this column, so no water runs from here:
                  the flow is dry.
                </p>
              )}
            </div>
          ) : null}
        </div>
        <div className="lake-deck rama-row">
          <Link className="eg-btn eg-btn--sm" href={placeHref(p.siteId, { level: 'street' })}>
            Back to the Street
          </Link>
          {rows ? (
            <>
              <span className="eg-chip eg-chip--accent" data-count>
                {page.connected ? page.count : null}
              </span>
              <span className="eg-muted">
                Rows{' '}
                {rows.rows.length ? `${rows.offset + 1}–${rows.offset + rows.rows.length}` : 'none'}
                , {rows.order}.
              </span>
              {rows.offset > 0 ? (
                <button
                  type="button"
                  className="eg-btn eg-btn--sm"
                  disabled={busy}
                  onClick={() => void more(Math.max(0, rows.offset - 50))}
                >
                  Newer rows
                </button>
              ) : null}
              {rows.more ? (
                <button
                  type="button"
                  className="eg-btn eg-btn--sm"
                  disabled={busy}
                  onClick={() => void more(rows.offset + rows.rows.length)}
                  data-more
                >
                  More rows
                </button>
              ) : null}
            </>
          ) : (
            <span className="eg-chip" data-not-connected>
              {page.connected ? null : page.why}
            </span>
          )}
          {masked.length ? (
            <span className="eg-chip eg-chip--warning" data-masked>
              Kept secret, never shown: {masked.map((c) => c.name).join(', ')}
            </span>
          ) : null}
        </div>
        {rows?.missing.length ? (
          <p className="eg-muted" style={{ margin: 0 }}>
            In the code but not in the database yet: {rows.missing.join(', ')}.
          </p>
        ) : null}
        {t.unread.length ? (
          <p className="eg-muted" style={{ margin: 0 }}>
            Some columns come from {t.unread.join(', ')}, written elsewhere: not read (untraced).
          </p>
        ) : null}
        <Words
          siteId={p.siteId}
          here={{ level: 'ground', table: t.table }}
          buildings={p.all}
          tables={p.tables}
        />
        {/* The same table for a screen reader, and for anyone who would rather read it as text. */}
        <table
          className="sr-only"
          data-ground-table={t.table}
          data-read-by={JSON.stringify(input.readBy)}
          data-written-by={JSON.stringify(input.writtenBy)}
        >
          <caption>
            {t.table}: {page.connected ? page.count : page.why}
          </caption>
          <thead>
            <tr>
              {input.columns.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  data-name={c.name}
                  data-type={c.type}
                  data-key={c.key ?? ''}
                  data-figure={c.figure ? 'yes' : 'no'}
                  data-masked={c.masked ? 'yes' : 'no'}
                >
                  {c.name} ({c.type})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {input.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} data-empty={v === null ? 'yes' : undefined}>
                    {v ?? 'empty'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
