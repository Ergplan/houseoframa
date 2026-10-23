'use client';
// The triptych (Stage 6): three 3840×2160 screens side by side, Discovery on the left, the Site in the
// centre, the Showroom on the right, each a full page of its own. Narrower than three screens, it falls
// back to one screen with the three as tabs. Narration (SpeechSynthesis) plays through the pod's headset,
// the browser's default output.
import { useEffect, useState } from 'react';

const PANES = [
  { key: 'discovery', title: 'Discovery', path: (s: string) => `/site/${s}/discovery` },
  { key: 'site', title: 'Site', path: (s: string) => `/site/${s}` },
  { key: 'showroom', title: 'Showroom', path: (s: string) => `/site/${s}/showroom` },
] as const;

/** Wide enough for three panes: three 4K screens, or a wide desktop for a rehearsal. */
const WIDE = '(min-width: 2400px)';

export function TriptychView({ siteId, banner }: { siteId: string; banner?: string }) {
  const [wide, setWide] = useState(false);
  const [tab, setTab] = useState<(typeof PANES)[number]['key']>('site');
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return (
    <div className={`triptych${wide ? ' wide' : ''}`} data-wide={wide}>
      {banner ? <div className="triptych-banner">{banner}</div> : null}
      {!wide && (
        <nav className="triptych-tabs" aria-label="Screens">
          {PANES.map((p) => (
            <button
              key={p.key}
              className={tab === p.key ? 'on' : ''}
              onClick={() => setTab(p.key)}
              aria-pressed={tab === p.key}
            >
              {p.title}
            </button>
          ))}
        </nav>
      )}
      <div className="triptych-panes">
        {PANES.map((p) => (
          <iframe
            key={p.key}
            title={p.title}
            src={p.path(siteId)}
            data-pane={p.key}
            hidden={!wide && tab !== p.key}
          />
        ))}
      </div>
    </div>
  );
}
