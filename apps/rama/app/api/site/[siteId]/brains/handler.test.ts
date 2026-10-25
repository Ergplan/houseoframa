import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { choiceProblems } from '@rama/workbench';
import { handleProductBrains, type BrainsDeps } from './handler';

const site = { id: 'chai', name: 'Chai Stall', kind: 'product' } as unknown as SiteLocation;
const ravi: Member = { id: 'r1', name: 'Ravi', email: null, role: 'customer' };
const deps = (): BrainsDeps => ({
  choose: vi.fn(async (_s, seats) => choiceProblems(seats)),
  baseUrl: 'http://rama.test',
});
const form = (auditor: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    'builder.vendor': 'anthropic',
    'builder.builder': 'claude-code',
    'builder.model': 'claude-sonnet-5-5',
    'auditor.vendor': auditor,
    'auditor.model': 'a-model',
    'drafter.vendor': 'anthropic',
    'drafter.model': 'claude-sonnet-5-5',
    'voice.vendor': 'openai',
    'voice.model': 'gpt-realtime',
  }))
    f.set(k, v);
  return f;
};
const where = (r: Response) => {
  const u = new URL(r.headers.get('location')!);
  return { page: u.pathname, said: u.searchParams.get('said'), error: u.searchParams.get('error') };
};

describe('POST /api/site/[siteId]/brains (asked in discovery)', () => {
  it('records the product’s brains as the person’s answer', async () => {
    const d = deps();
    expect(where(await handleProductBrains(site, ravi, form('gemini'), d))).toEqual({
      page: '/site/chai/discovery',
      said: 'The brains are chosen, on a card decided by Ravi.',
      error: null,
    });
    expect(d.choose).toHaveBeenCalledWith(
      site,
      expect.objectContaining({ auditor: { vendor: 'gemini', model: 'a-model' } }),
      ravi,
    );
  });

  it('refuses the builder’s own company as the auditor, and a site only drawn', async () => {
    expect(where(await handleProductBrains(site, ravi, form('anthropic'), deps())).error).toMatch(
      /the checker is never the builder/,
    );
    const outside = { ...site, kind: 'outside' } as SiteLocation;
    expect(where(await handleProductBrains(outside, ravi, form('openai'), deps())).error).toBe(
      'Only a product made here has brains to choose.',
    );
  });
});
