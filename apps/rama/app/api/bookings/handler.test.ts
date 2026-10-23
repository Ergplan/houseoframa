import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import { handleBooking } from './handler';
import { handlePodStatus } from '../pod/[n]/status/handler';

const asha: Member = { id: 'p1', name: 'Asha Rao', email: 'asha@example.com', role: 'member' };
const body = {
  pod: 1,
  shift: 'work',
  siteId: 'shop',
  startsAt: '2026-10-23T09:00:00Z',
  endsAt: '2026-10-23T13:00:00Z',
};

describe('POST /api/bookings', () => {
  it('books as the signed-in member, with dates', async () => {
    const book = vi.fn(async (_m: Member, i: { startsAt: Date }) => ({
      id: 'b1',
      pod: 1,
      siteId: 'shop',
      personId: 'p1',
      shift: 'work' as const,
      startsAt: i.startsAt.toISOString(),
      endsAt: '',
    }));
    const r = await handleBooking(asha, body, book);
    expect(r.status).toBe(200);
    expect(book).toHaveBeenCalledWith(asha, {
      ...body,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
    });
  });
  it('answers the rules’ refusals with their status, and 400 for a bad body', async () => {
    const refuse = async () =>
      Promise.reject(
        Object.assign(new Error('pod 1 is already booked then'), {
          name: 'BookingError',
          status: 409,
        }),
      );
    expect((await handleBooking(asha, body, refuse)).status).toBe(409);
    expect((await handleBooking(asha, { ...body, startsAt: 'tomorrow' }, refuse)).status).toBe(400);
  });
});

describe('GET /api/pod/<n>/status', () => {
  const state = async (pod: number) =>
    pod === 1
      ? {
          pod: 1,
          name: 'Window',
          light: 'amber' as const,
          booking: {
            id: 'b',
            pod: 1,
            siteId: 'shop',
            personId: 'p1',
            shift: 'work' as const,
            startsAt: 's',
            endsAt: '2026-10-23T13:00:00.000Z',
          },
          site: {
            siteId: 'shop',
            name: 'Shop',
            commit: 'c',
            screens: 1,
            signedScreens: [],
            unsigned: 1,
            capturedCommit: 'c',
            audit: null,
          },
        }
      : null;
  it('tells the controller the light, the shift, the end and the site, not who booked', async () => {
    const r = await handlePodStatus('1', 'Bearer t0k', { token: 't0k', podState: state });
    expect(await r.json()).toEqual({
      ok: true,
      pod: 1,
      light: 'amber',
      shift: 'work',
      until: '2026-10-23T13:00:00.000Z',
      site: { id: 'shop', name: 'Shop' },
    });
  });
  it('needs the controller token, and says so when none is configured', async () => {
    expect((await handlePodStatus('1', null, { token: 't0k', podState: state })).status).toBe(401);
    expect(
      (await handlePodStatus('1', 'Bearer nope', { token: 't0k', podState: state })).status,
    ).toBe(401);
    expect(
      (await handlePodStatus('1', 'Bearer t0k', { token: undefined, podState: state })).status,
    ).toBe(503);
    expect(
      (await handlePodStatus('9', 'Bearer t0k', { token: 't0k', podState: state })).status,
    ).toBe(404);
    expect(
      (await handlePodStatus('x', 'Bearer t0k', { token: 't0k', podState: state })).status,
    ).toBe(404);
  });
});
