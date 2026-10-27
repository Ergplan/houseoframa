// @vendor — act 3's narration (narrate.v2, the builder seat) on the sample's cards, against the real
// builder model: one line per building and one for what it will not do, with no number the cards do not
// hold (else narrateDesign falls back to reading the cards). Run on request only (RAMA_VENDOR_TESTS=1).
import { describe, expect, it } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import { call } from '@rama/model';
import type { Decision } from '@rama/shared';
import { SAMPLE_CARDS } from '@rama/workbench';
import { cardBuildings, narrateDesign } from '../src/room.ts';

const cards: Decision[] = SAMPLE_CARDS.map((c, i) => ({
  ...c,
  id: `d${i}`,
  siteId: 'self',
  bricks: [],
  status: 'decided',
  by: 'Rachit Agarwal',
  at: '2026-10-27T10:00:00Z',
}));

describe('@vendor the design explained aloud', () => {
  it('is written by the builder from the cards, building by building, with nothing the cards do not say', async () => {
    const site = { id: 'self', name: 'Chai Stall (rehearsal)' } as SiteLocation;
    const r = await narrateDesign(site, cards, cardBuildings(cards), {
      createdBy: 'rama:test@0',
      // The builder seat on whichever company has credit here: RAMA_NARRATE_VENDOR=openai puts it on
      // OpenAI's model for this test (Codex runs there), Anthropic otherwise.
      call: (req) =>
        call(req, {
          record: async () => 'not-recorded',
          ...(process.env.RAMA_NARRATE_VENDOR === 'openai'
            ? {
                seats: async () => ({
                  builder: { vendor: 'openai', model: process.env.OPENAI_MODEL!, builder: 'codex' },
                  auditor: { vendor: 'anthropic', model: 'claude-sonnet-5-5' },
                  drafter: { vendor: 'openai', model: process.env.OPENAI_MODEL! },
                  voice: { vendor: 'openai', model: 'gpt-realtime' },
                }),
              }
            : {}),
        }),
    });
    console.log(
      r.by,
      r.why ?? '',
      '\n' + r.lines.map((l) => `[${l.building}] ${l.text}`).join('\n'),
    );
    expect(r.by).toBe('builder');
    expect(r.lines.map((l) => l.building)).toEqual([
      'See today’s orders',
      'Take an order',
      'Count the day’s takings',
      null,
    ]);
    expect(r.lines.at(-1)!.text).toMatch(/^What it will not do:/);
    // The room asks "Shall I build this?" once, after the last line; the lines ask nothing.
    expect(r.lines.filter((l) => l.text.includes('?'))).toEqual([]);
  }, 180_000);
});
