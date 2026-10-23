'use client';
// The member confirms the auditor's drafted text of a report, by name (Invariant 6).
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConfirmReport({
  siteId,
  reportId,
  member,
}: {
  siteId: string;
  reportId: string;
  member: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/site/${siteId}/audit/confirm`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reportId }),
            });
            const out = (await res.json()) as { ok: boolean; error?: string };
            if (!out.ok) setError(out.error ?? `HTTP ${res.status}`);
            else router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        I have read the auditor&apos;s text: confirm it as {member}
      </button>
      {error && (
        <span className="red" role="alert">
          {' '}
          {error}
        </span>
      )}
    </p>
  );
}

/** The state of the auditor's drafted text: unconfirmed until a named person confirms it. */
export function DraftState({
  confirmations,
  by,
}: {
  confirmations: { person: string; at: string }[];
  by: string;
}) {
  const c = confirmations.at(-1);
  return c ? (
    <span className="pill green" data-draft="confirmed">
      drafted by {by}; confirmed by {c.person}, {c.at.slice(0, 10)}
    </span>
  ) : (
    <span className="pill amber" data-draft="unconfirmed">
      drafted by {by}; unconfirmed
    </span>
  );
}
