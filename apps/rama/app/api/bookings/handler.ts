// A member books a pod (Stage 6): work on a site they own, or game mode. The rules live in
// server/floor.ts `book()`; this answers 400, 404 or 409 with its reason.
import { z } from 'zod';
import type { Member } from '@rama/db';
import type { PodBooking } from '@rama/blueprint/metrics';

export const BookingBody = z.object({
  pod: z.number().int().min(1),
  shift: z.enum(['work', 'game']),
  siteId: z.string().min(1).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export async function handleBooking(
  member: Member,
  raw: unknown,
  book: (
    m: Member,
    input: { pod: number; shift: 'work' | 'game'; siteId?: string; startsAt: Date; endsAt: Date },
  ) => Promise<PodBooking & { id: string }>,
): Promise<Response> {
  const body = BookingBody.safeParse(raw);
  if (!body.success)
    return Response.json(
      { ok: false, error: 'expected {pod, shift, siteId?, startsAt, endsAt}' },
      { status: 400 },
    );
  try {
    const b = await book(member, {
      ...body.data,
      startsAt: new Date(body.data.startsAt),
      endsAt: new Date(body.data.endsAt),
    });
    return Response.json({ ok: true, booking: b });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.name === 'BookingError')
      return Response.json({ ok: false, error: e.message }, { status: e.status });
    throw err;
  }
}
