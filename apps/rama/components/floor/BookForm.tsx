'use client';
// Books a pod: a site (work) or game mode, from now for a number of hours.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BookForm({
  pods,
  sites,
}: {
  pods: { pod: number; name: string }[];
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pod, setPod] = useState(pods[0]?.pod ?? 1);
  const [site, setSite] = useState(sites[0]?.id ?? '');
  const [hours, setHours] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const submit = async (shift: 'work' | 'game') => {
    setError(null);
    const starts = new Date();
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pod,
        shift,
        ...(shift === 'work' ? { siteId: site } : {}),
        startsAt: starts.toISOString(),
        endsAt: new Date(starts.getTime() + hours * 3_600_000).toISOString(),
      }),
    });
    const out = (await res.json()) as { ok: boolean; error?: string };
    if (!out.ok) setError(out.error ?? `HTTP ${res.status}`);
    else router.push(`/pod/${pod}`);
  };
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label>
        Pod{' '}
        <select value={pod} onChange={(e) => setPod(Number(e.target.value))} aria-label="Pod">
          {pods.map((p) => (
            <option key={p.pod} value={p.pod}>
              {p.pod} · {p.name}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Site{' '}
        <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        For{' '}
        <input
          type="number"
          min={1}
          max={12}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          aria-label="Hours"
        />{' '}
        hours
      </label>
      <p>
        <button className="primary" type="button" onClick={() => submit('work')} disabled={!site}>
          Book for work on this site, from now
        </button>{' '}
        <button type="button" onClick={() => submit('game')}>
          Book for game mode
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
