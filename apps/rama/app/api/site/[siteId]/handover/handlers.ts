// Handover routes (Stage 6): confirm the structure, hand over, check in. Each acts as the signed-in owner
// of the site (authorized by the route) and answers 400 for a bad body, 409 when the site is not ready.
import { z } from 'zod';

export async function handleHandoverAction<T>(action: () => Promise<T>): Promise<Response> {
  try {
    return Response.json({ ok: true, result: await action() });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'HandoverError')
      return Response.json({ ok: false, error: e.message }, { status: 409 });
    throw err;
  }
}

export const CheckinBody = z.object({ inUse: z.boolean(), note: z.string().max(1000).optional() });
