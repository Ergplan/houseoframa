import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { ACTS, handleAct, type ActDeps } from './handler';

const site = { id: 'chai', name: 'Chai Stall', kind: 'product' } as unknown as SiteLocation;
const tara: Member = { id: 't1', name: 'Tara', email: null, role: 'trainer' };
const deps = (over: Partial<ActDeps> = {}): ActDeps => ({
  startJob: vi.fn(),
  startSession: vi.fn(async () => {}),
  startBuild: vi.fn(),
  pauseBuild: vi.fn(),
  baseUrl: 'http://rama.test',
  now: () => new Date('2026-10-24T10:00:00Z'),
  ...over,
});
const act = (a: string) => {
  const f = new FormData();
  f.set('act', a);
  return f;
};
const where = (r: Response) => {
  const u = new URL(r.headers.get('location')!);
  return { page: u.pathname, said: u.searchParams.get('said'), error: u.searchParams.get('error') };
};

describe('POST /api/site/[siteId]/act (the trainer console)', () => {
  it('starts the work buttons as jobs on the site, as the person', async () => {
    for (const [a, kind] of [
      ['refresh', 'refresh'],
      ['photograph', 'photograph'],
      ['tests', 'tests'],
      ['call-audit', 'audit'],
    ] as const) {
      const d = deps();
      const r = await handleAct(site, tara, act(a), d);
      expect(d.startJob).toHaveBeenCalledWith(kind, site, tara);
      expect(where(r)).toEqual({
        page: '/site/chai',
        said: `${ACTS[a].label}: started. This page shows its progress.`,
        error: null,
      });
    }
  });

  it('opens a session in the site office, and takes the person to the walkthrough or the handover', async () => {
    const d = deps();
    expect(where(await handleAct(site, tara, act('start-session'), d)).page).toBe(
      '/site/chai/discovery',
    );
    expect(d.startSession).toHaveBeenCalledWith(site, 'Session of 2026-10-24', tara);
    expect(where(await handleAct(site, tara, act('start-walkthrough'), d)).page).toBe(
      '/site/chai/walkthrough',
    );
    expect(where(await handleAct(site, tara, act('hand-over'), d)).page).toBe(
      '/site/chai/handover',
    );
  });

  it('starts the build on a product as the person, pauses it, and refuses to build a site only drawn', async () => {
    const d = deps();
    expect(where(await handleAct(site, tara, act('start-build'), d))).toEqual({
      page: '/site/chai',
      said: 'Start build: the builder is at work. Each lift shows here as it is checked.',
      error: null,
    });
    expect(d.startBuild).toHaveBeenCalledWith(site, tara);
    expect(where(await handleAct(site, tara, act('pause-build'), d)).said).toBe(
      'Pause build: the build stops after the lift in hand.',
    );
    expect(d.pauseBuild).toHaveBeenCalledWith(site);
    const outside = { ...site, kind: 'outside' } as SiteLocation;
    expect(where(await handleAct(outside, tara, act('start-build'), d)).error).toBe(
      'Only a product made here is built here; this site is only drawn.',
    );
    expect(d.startBuild).toHaveBeenCalledTimes(1);
  });

  it('closes ideation by handing the room to the voice for act 3, and refuses an unknown act', async () => {
    const d = deps();
    const r = await handleAct(site, tara, act('close-ideation'), d);
    expect(new URL(r.headers.get('location')!).pathname).toBe('/site/chai/discovery');
    expect(new URL(r.headers.get('location')!).searchParams.get('act')).toBe('agree');
    const outside = { ...site, kind: 'outside' } as SiteLocation;
    expect(where(await handleAct(outside, tara, act('close-ideation'), d)).error).toBe(
      'Only a product made here has an ideation to close.',
    );
    expect(where(await handleAct(site, tara, act('rm -rf'), d)).error).toBe(
      'There is no such button.',
    );
    expect(d.startJob).not.toHaveBeenCalled();
  });
});
