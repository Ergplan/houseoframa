// @vendor: drafts one real question through the builder vendor and writes a real model_calls row (site self).
// Excluded from the watcher and CI; run with `RAMA_VENDOR_TESTS=1 pnpm vitest run --project @rama/ceremony -t @vendor`.
import { describe, expect, it } from 'vitest';
import { draftQuestion } from '../src/discovery.ts';

describe('@vendor discovery drafting', () => {
  it('@vendor drafts one short question that is not a decision', async () => {
    const q = await draftQuestion(
      {
        site: 'EkBill',
        turns: [
          {
            speaker: 'Owner',
            text: 'I raise about one bill a week, mostly to the same dozen customers, from my phone.',
          },
          {
            speaker: 'Owner',
            text: 'The bill has to show GST correctly, and I send it on WhatsApp.',
          },
        ],
        decisions: [],
      },
      { siteId: 'self' },
    );
    console.log(`drafted: "${q}"`);
    expect(q.endsWith('?')).toBe(true);
    expect(q.length).toBeLessThan(400);
  }, 120_000);
});
