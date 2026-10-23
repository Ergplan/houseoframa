// The pod light for the pod controller (Stage 6): GET /api/pod/<n>/status with the controller's bearer
// token (RAMA_POD_TOKEN). It says the light and the booking's end; the site is named, not who booked it.
import type { PodState } from '../../../../../server/floor';

export async function handlePodStatus(
  n: string,
  authorization: string | null,
  deps: { token: string | undefined; podState: (pod: number) => Promise<PodState | null> },
): Promise<Response> {
  if (!deps.token)
    return Response.json(
      { ok: false, error: 'RAMA_POD_TOKEN is not set: the pod controller cannot be told apart' },
      { status: 503 },
    );
  if (authorization !== `Bearer ${deps.token}`)
    return Response.json(
      { ok: false, error: 'the pod controller token is required' },
      { status: 401 },
    );
  const pod = Number(n);
  if (!Number.isInteger(pod) || pod < 1)
    return Response.json({ ok: false, error: 'no such pod' }, { status: 404 });
  const s = await deps.podState(pod);
  if (!s) return Response.json({ ok: false, error: 'no such pod' }, { status: 404 });
  return Response.json({
    ok: true,
    pod: s.pod,
    light: s.light,
    shift: s.booking?.shift ?? null,
    until: s.booking?.endsAt ?? null,
    site: s.site ? { id: s.site.siteId, name: s.site.name } : null,
  });
}
