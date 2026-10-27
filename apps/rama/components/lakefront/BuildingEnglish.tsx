'use client';
// The English pane, folded, at the Building level (Stage 11): each part of the building with the plain
// sentences beside its code, as the code level shows them; opened, it reads them in. Each part leads to
// its code, where the sentences are confirmed.
import { useState } from 'react';
import Link from 'next/link';
import type { CodeView } from '@rama/workbench';
import { placeHref } from './places';

export function BuildingEnglish({
  siteId,
  building,
  bricks,
}: {
  siteId: string;
  building: string;
  bricks: string[];
}) {
  const [views, setViews] = useState<Record<string, CodeView | null> | null>(null);
  const open = async () => {
    if (views) return;
    const got: Record<string, CodeView | null> = {};
    for (const p of bricks) {
      const r = (await (
        await fetch(`/api/site/${siteId}/code?path=${encodeURIComponent(p)}`)
      ).json()) as { ok: boolean; view?: CodeView };
      got[p] = r.ok ? r.view! : null;
    }
    setViews(got);
  };
  return (
    <details
      className="eg-glass rama-card building-english"
      onToggle={(e) => (e.currentTarget.open ? void open() : undefined)}
    >
      <summary className="eg-overline">Its code, in plain English</summary>
      {!views ? (
        <p className="eg-muted">Reading…</p>
      ) : (
        bricks.map((p) => {
          const v = views[p];
          const said = v?.blocks.filter((b) => b.explanation.state !== 'none') ?? [];
          return (
            <div key={p} className="building-english__part" data-part={p}>
              <Link
                href={`${placeHref(siteId, { level: 'code', building })}&brick=${encodeURIComponent(p)}`}
              >
                {p}
              </Link>
              {said.length ? (
                <ul>
                  {said.map((b) => (
                    <li key={b.hash}>
                      {b.explanation.state !== 'none' ? b.explanation.sentence : ''}{' '}
                      <small className="eg-muted">
                        {b.explanation.state === 'confirmed'
                          ? `confirmed by ${b.explanation.by}`
                          : 'not confirmed'}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="eg-muted" style={{ margin: 0 }}>
                  Not explained yet
                </p>
              )}
            </div>
          );
        })
      )}
    </details>
  );
}
