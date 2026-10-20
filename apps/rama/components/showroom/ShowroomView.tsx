'use client';
// The Showroom: the target's real screens, photographed from its built app. Hotspots sit over figures
// where Playwright found them: amber for a traced figure (click for its trail), grey for an untraced one.
// A strip of screens runs underneath. Layout ported from the weekend prototype's showroom overlay
// (reference/weekend-prototype/house-of-rama.html, openShow).
import { useState } from 'react';
import Link from 'next/link';
import type { Showroom } from '@rama/trace/showroom';
import { TrailPanel, UntracedPanel } from './TrailPanel';

export function ShowroomView({
  siteId,
  name,
  showroom,
  initialScreen,
  initialFigure,
}: {
  siteId: string;
  name: string;
  showroom: Showroom;
  initialScreen?: string | null;
  initialFigure?: string | null;
}) {
  const [screenName, setScreenName] = useState(
    showroom.screens.find((s) => s.name === initialScreen)?.name ?? showroom.screens[0]?.name ?? '',
  );
  const screen = showroom.screens.find((s) => s.name === screenName) ?? showroom.screens[0];
  const [figure, setFigure] = useState<string | null>(initialFigure ?? null);
  const picked = screen?.figures.find((f) => f.id === figure) ?? null;
  const shotUrl = (shot: string) => `/api/site/${siteId}/shots/${shot}`;

  return (
    <>
      <header className="hud">
        <h1>
          <Link href="/">HOUSE OF RAMA</Link>
        </h1>
        <span className="tag">Showroom · {name}</span>
        <span className="site">
          captured {showroom.capturedAt.slice(0, 16).replace('T', ' ')} UTC at{' '}
          {showroom.commit.slice(0, 7)}
        </span>
      </header>
      <p className="lede">
        <b>
          {showroom.counts.traced} of {showroom.counts.shown}
        </b>{' '}
        figures on these screens are traced to the code that computes them; the rest are outlined
        grey as untraced. <Link href={`/site/${siteId}`}>◀ Back to the site</Link>
      </p>
      {screen ? (
        <div className="cab">
          <div style={{ minWidth: 0 }}>
            <div className="shotbar">
              <h4>{screen.title}</h4>
              <span className="real">real screen</span>
              {screen.role ? <span className="real amb">as {screen.role}</span> : null}
              <code>{screen.route}</code>
              <span className="hint">{screen.bricks.length} bricks behind it</span>
            </div>
            <div className="shotview">
              <div
                className="shotwrap"
                style={{ aspectRatio: `${screen.width} / ${screen.height}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot, served as is */}
                <img
                  src={shotUrl(screen.shot)}
                  alt={`${screen.title}, as the target's app shows it`}
                />
                {screen.figures.map((f) => (
                  <button
                    key={f.id}
                    className={`hot${f.traced ? '' : ' untraced'}${figure === f.id ? ' on' : ''}`}
                    data-figure={f.id}
                    data-traced={f.traced}
                    aria-label={
                      f.traced
                        ? `Traced figure ${f.text}: open its trail`
                        : `Untraced figure ${f.text}`
                    }
                    style={{
                      left: `${(f.box.x / screen.width) * 100}%`,
                      top: `${(f.box.y / screen.height) * 100}%`,
                      width: `${(f.box.w / screen.width) * 100}%`,
                      height: `${(f.box.h / screen.height) * 100}%`,
                    }}
                    onClick={() => setFigure(f.id)}
                  />
                ))}
              </div>
            </div>
            <div className="strip" aria-label="Screens">
              {showroom.screens.map((s) => (
                <button
                  key={s.name}
                  className={s.name === screen.name ? 'on' : ''}
                  onClick={() => {
                    setScreenName(s.name);
                    setFigure(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot thumbnail */}
                  <img src={shotUrl(s.shot)} alt="" />
                  <span>{s.title}</span>
                </button>
              ))}
            </div>
          </div>
          <aside className="mon" aria-live="polite">
            {picked && picked.traced && showroom.trails[`${screen.name}/${picked.id}`] ? (
              <TrailPanel trail={showroom.trails[`${screen.name}/${picked.id}`]!} />
            ) : picked ? (
              <UntracedPanel text={picked.text ?? picked.id} />
            ) : (
              <>
                <h2>{screen.title}</h2>
                <p>
                  {screen.figures.filter((f) => f.traced).length} traced and{' '}
                  {screen.figures.filter((f) => !f.traced).length} untraced figures on this screen.
                  Click an amber outline to read how the figure is computed, from which inputs,
                  where they live and who built it.
                </p>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}
