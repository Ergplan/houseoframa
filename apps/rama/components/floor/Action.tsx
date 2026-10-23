'use client';
// A button that posts to a site route and refreshes the page, showing the route's refusal if any.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function Action({
  url,
  body = {},
  label,
  primary,
}: {
  url: string;
  body?: unknown;
  label: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        className={primary ? 'primary' : ''}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => null);
          const out = res
            ? ((await res.json()) as { ok: boolean; error?: string })
            : { ok: false, error: 'network' };
          setBusy(false);
          if (!out.ok) setError(out.error ?? 'refused');
          else router.refresh();
        }}
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="red">
          {' '}
          {error}
        </span>
      )}
    </span>
  );
}
