// POST /api/rehearsal (Stage 10): a trainer starts a rehearsal on the sample product; a customer cannot.
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { back } from '../../../server/http';
import { handleRehearsal } from './handler';

const tara: Member = { id: 't1', name: 'Tara', email: null, role: 'trainer' };
const asha: Member = { id: 'a1', name: 'Asha Rao', email: null, role: 'customer' };
const where = (r: Response) => {
  const u = new URL(r.headers.get('location')!);
  return { page: u.pathname, said: u.searchParams.get('said'), error: u.searchParams.get('error') };
};

describe('POST /api/rehearsal', () => {
  it('makes the rehearsal for a trainer and opens its site office', async () => {
    const make = vi.fn(
      async () => ({ id: 'rehearsal-1', name: 'Chai Stall (rehearsal)' }) as SiteLocation,
    );
    expect(where(await handleRehearsal(tara, { make, baseUrl: 'http://rama.test', back }))).toEqual(
      {
        page: '/site/rehearsal-1/discovery',
        said: 'Chai Stall (rehearsal) is ready, its cards drafted by Tara and open. Start the session with the voice.',
        error: null,
      },
    );
    expect(make).toHaveBeenCalledWith(tara);
  });

  it('refuses a customer', async () => {
    const make = vi.fn();
    expect(
      where(await handleRehearsal(asha, { make, baseUrl: 'http://rama.test', back })).error,
    ).toBe('A trainer starts a rehearsal: the cards are drafted in the trainer’s name.');
    expect(make).not.toHaveBeenCalled();
  });
});
