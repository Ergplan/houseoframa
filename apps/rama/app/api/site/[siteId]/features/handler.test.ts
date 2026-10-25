import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import type { FeaturesFile } from '@rama/stage';
import { fixtureBlueprint } from '../../../../../test/blueprint';
import { handleNameBuilding, type FeaturesDeps } from './handler';

const site = { id: 'chai', name: 'Chai Stall', repoDir: '/x' } as unknown as SiteLocation;
const asha: Member = { id: 'p1', name: 'Asha', email: null, role: 'customer' };
// The fixture with one screen, drafted as the building `bills`.
const bp = {
  ...fixtureBlueprint(),
  screens: [
    {
      id: '/bills',
      name: 'Bills',
      route: '/bills',
      file: 'app/page.tsx',
      bricks: ['app/page.tsx'],
    },
  ],
};
const deps = (file: FeaturesFile | null = null, over: Partial<FeaturesDeps> = {}) => {
  const written: FeaturesFile[] = [];
  const d: FeaturesDeps = {
    blueprint: () => bp,
    read: () => ({ file, problem: null }),
    write: (_, f) => void written.push(f),
    log: vi.fn(async () => {}),
    baseUrl: 'http://rama.test',
    now: () => new Date('2026-10-25T10:00:00Z'),
    ...over,
  };
  return { d, written };
};
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const where = (r: Response) => {
  const u = new URL(r.headers.get('location')!);
  return {
    page: `${u.pathname}?b=${u.searchParams.get('b')}`,
    said: u.searchParams.get('said'),
    error: u.searchParams.get('error'),
  };
};

describe('POST /api/site/[siteId]/features (name this building)', () => {
  const id = 'bills';

  it('writes the name in the person’s words, confirmed by them, and records it', async () => {
    const { d, written } = deps();
    const r = await handleNameBuilding(
      site,
      asha,
      form({ building: id, name: 'See the bills', does: 'Lists them.' }),
      d,
    );
    expect(where(r)).toEqual({
      page: `/site/chai?b=${id}`,
      said: '“See the bills” is the building’s name, confirmed by Asha.',
      error: null,
    });
    expect(written[0]!.features).toEqual([
      expect.objectContaining({
        id,
        name: 'See the bills',
        does: 'Lists them.',
        confirmedBy: 'Asha',
        confirmedAt: '2026-10-25T10:00:00.000Z',
      }),
    ]);
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 'chai',
        building: id,
        name: 'See the bills',
        personId: 'p1',
      }),
    );
  });

  it('refuses an empty name, and changes nothing when the names file cannot be read', async () => {
    const { d, written } = deps();
    expect(
      where(await handleNameBuilding(site, asha, form({ building: id, name: ' ' }), d)).error,
    ).toBe('A building needs a name.');
    const broken = deps(null, { read: () => ({ file: null, problem: 'not JSON' }) });
    expect(
      where(await handleNameBuilding(site, asha, form({ building: id, name: 'X' }), broken.d))
        .error,
    ).toMatch(/cannot be read/);
    expect([...written, ...broken.written]).toEqual([]);
    expect(d.log).not.toHaveBeenCalled();
  });

  it('refuses a building that is not there', async () => {
    const { d } = deps();
    expect(
      where(await handleNameBuilding(site, asha, form({ building: 'nope', name: 'X' }), d)).error,
    ).toBe('There is no such building to name.');
  });
});
