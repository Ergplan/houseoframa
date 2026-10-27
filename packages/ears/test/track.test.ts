// The track by voice (Stage 10): each question answered from the trail only; a step the trail lacks, and
// a figure with no trail, answered as untraced with the figure's name.
import { describe, expect, it } from 'vitest';
import { answerTrack } from '../src/track.ts';
import { mouthCheck } from '../src/mouth.ts';
import { ON_HAND, TAKINGS } from './fixtures.ts';

const [takings, gst, tip] = ON_HAND as [
  (typeof ON_HAND)[0],
  (typeof ON_HAND)[0],
  (typeof ON_HAND)[0],
];

describe('track questions, answered from the trail', () => {
  it('maps each of the six questions to its step of the trail', () => {
    expect(answerTrack('from', takings)).toBe(
      '“Today’s takings”, on the screen “Today’s total”, is worked out by the product’s own code in features/total/plan.ts, line 12, and worked out again by House of Rama it came out the same.',
    );
    expect(answerTrack('how', takings)).toBe(
      '“Today’s takings” is worked out like this: every order’s amount, added up.',
    );
    expect(answerTrack('inputs', takings)).toBe(
      'Into “Today’s takings” go the day’s orders, 4 orders.',
    );
    expect(answerTrack('kept', takings)).toBe(
      '“Today’s takings” is worked out from what is kept in the day’s orders: data/orders.json.',
    );
    expect(answerTrack('built', takings)).toBe(
      '“Today’s takings” was built in 2 changes; the last was “Count the day’s takings: the Today’s total screen with takings and GST”, by Claude Code, on 2026-10-25.',
    );
    expect(answerTrack('signed', takings)).toBe(
      'The screen “Today’s total” was signed by Asha Rao on 2026-10-26: “The day’s total is right.”.',
    );
    expect(answerTrack('signed', gst)).toBe('Nobody has signed the screen “Today’s total” yet.');
  });

  it('says untraced, with the figure’s name, when there is no trail or no step', () => {
    for (const step of ['from', 'how', 'inputs', 'kept', 'built', 'signed'] as const)
      expect(answerTrack(step, tip)).toMatch(/^“Tip jar” is untraced: /);
    const bare = {
      ...takings,
      trail: {
        ...TAKINGS,
        data: [],
        inputs: [],
        build: [],
        formula: { ...TAKINGS.formula, english: '' },
      },
    };
    expect(answerTrack('kept', bare)).toBe(
      'Where “Today’s takings” is kept is untraced: its trail names no table or file.',
    );
    expect(answerTrack('inputs', bare)).toMatch(/is untraced/);
    expect(answerTrack('how', bare)).toMatch(/is untraced/);
    expect(answerTrack('built', bare)).toMatch(/is untraced/);
  });

  it('holds no number the trail does not hold, but the count of changes it makes from it', () => {
    for (const step of ['from', 'how', 'inputs', 'kept', 'built', 'signed'] as const)
      for (const f of ON_HAND) {
        const t = f.trail;
        const changes = t ? `${new Set(t.build.map((b) => b.sha)).size}` : '';
        const source = t ? `${JSON.stringify(t)} ${changes}` : '';
        expect(
          mouthCheck(answerTrack(step, f), [source, f.name]).unsupported,
          `${f.name} ${step}`,
        ).toEqual([]);
      }
  });
});

describe('the mouth check', () => {
  const lines = ['The New order amount is ₹30.00 for two cups at 1,500 paise a cup.'];
  it('passes a reading of the line, in words or digits', () => {
    expect(
      mouthCheck(
        'The new order amount is thirty rupees for two cups at fifteen hundred paise a cup.',
        lines,
      ),
    ).toEqual({ ok: true, unsupported: [] });
    expect(mouthCheck('The New order amount is ₹30.00 for 2 cups.', lines).ok).toBe(true);
  });
  it('reports a number no line gave the voice', () => {
    expect(
      mouthCheck('A cup of masala chai costs twenty rupees, and GST is 18 percent.', lines),
    ).toEqual({
      ok: false,
      unsupported: [20, 18],
    });
  });
});
