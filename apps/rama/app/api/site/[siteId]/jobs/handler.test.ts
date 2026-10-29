// GET jobs (Stage 12): the latest job of each kind for the site, with its state, for the page to follow.
import { describe, expect, it } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Job } from '@rama/workbench';
import { handleJobs } from './handler';

const site = { id: 'ergplan', name: 'ergPLAN' } as SiteLocation;
const job = (kind: Job['kind'], finished: boolean): Job => ({
  id: kind,
  kind,
  siteId: 'ergplan',
  person: 'Rachit Agarwal',
  startedAt: '2026-10-29T14:50:00Z',
  finishedAt: finished ? '2026-10-29T14:58:00Z' : null,
  ok: finished ? true : null,
  steps: [{ name: 'Lift 1', ok: null, ms: 0, sentence: 'The builder is at work.' }],
});

describe('GET jobs', () => {
  it('gives each kind that has run, with whether it is running', async () => {
    const r = handleJobs(site, {
      latest: (kind) =>
        kind === 'build' ? job('build', false) : kind === 'tests' ? job('tests', true) : null,
      status: (j) => (j.finishedAt ? 'passed' : 'running'),
    });
    const body = (await r.json()) as { ok: boolean; jobs: { kind: string; status: string }[] };
    expect(body.ok).toBe(true);
    expect(body.jobs.map((j) => [j.kind, j.status])).toEqual([
      ['build', 'running'],
      ['tests', 'passed'],
    ]);
  });

  it('gives none for a site where nothing has run', async () => {
    const r = handleJobs(site, { latest: () => null, status: () => 'passed' });
    expect(((await r.json()) as { jobs: unknown[] }).jobs).toEqual([]);
  });
});
