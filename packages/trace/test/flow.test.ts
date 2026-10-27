// The flow of a figure (Stage 11), from a recorded re-execution of the sample product (its capture after
// Test drive): the real rows leaving where they are kept, the value its own function gave, the formula,
// the figure on the screen; and a step with nothing recorded is dry and says untraced.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Capture } from '../src/capture.ts';
import { flowOf } from '../src/flow.ts';

const capture = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, 'fixtures/flow-capture.json'), 'utf8'),
) as Capture;

describe('the flow of a figure', () => {
  it('runs the day’s real orders into Today’s takings, step by step, in the customer’s words', () => {
    const f = flowOf(capture, 'todays-total/todays-takings')!;
    expect(f.full).toBe(true);
    expect(f.steps.map((s) => [s.kind, s.value === null ? null : 'value'])).toEqual([
      ['source', 'value'],
      ['function', 'value'],
      ['formula', 'value'],
      ['screen', 'value'],
    ]);
    expect(f.steps[0]!.rows).toEqual({
      count: 4,
      first: [
        'Masala chai, cups 2, price of cup 1500',
        'Ginger chai, cups 1, price of cup 1800',
        'Masala chai, cups 3, price of cup 1500',
      ],
    });
    expect(f.steps.map((s) => s.sentence)).toEqual([
      '4 rows left data/orders.json: Masala chai, cups 2, price of cup 1500; Ginger chai, cups 1, price of cup 1800; Masala chai, cups 3, price of cup 1500.',
      'Became 11300 in takings.ts.',
      'Every order’s amount, added up.',
      '₹113.00 on the screen “Today’s total”.',
    ]);
  });

  it('runs dry where nothing was recorded, and says untraced', () => {
    const dry: Capture = { ...capture, runs: {} };
    const f = flowOf(dry, 'todays-total/gst-on-takings')!;
    expect(f.full).toBe(false);
    expect(f.steps.map((s) => s.value)).toEqual([
      null,
      null,
      'Five percent of the day’s takings, rounded to the paisa.',
      null,
    ]);
    expect(f.steps[0]!.sentence).toBe(
      'Today’s takings (paise): no value was recorded, so this pipe is dry (untraced).',
    );
    expect(f.steps[1]!.sentence).toBe(
      'It was not worked out again in takings.ts, so the water stops here (untraced).',
    );
    expect(f.steps[3]!.sentence).toMatch(/no water reaches it: the flow is untraced\.$/);
    // A figure with no mapping has no flow at all: it is untraced.
    expect(flowOf(capture, 'todays-total/made-up')).toBeNull();
  });

  it('ends a repeated figure’s flow on its own appearance, not the first one', () => {
    const twice: Capture = {
      ...capture,
      screens: capture.screens.map((s) =>
        s.name === 'todays-total'
          ? {
              ...s,
              figures: [
                ...s.figures,
                { ...s.figures.find((f) => f.id === 'todays-takings')!, text: '₹999.00' },
              ],
            }
          : s,
      ),
      runs: {
        ...capture.runs,
        'todays-total/todays-takings~2': {
          ...capture.runs['todays-total/todays-takings']!,
          text: '99900',
        },
      },
    };
    expect(flowOf(twice, 'todays-total/todays-takings')!.steps.at(-1)!.sentence).toBe(
      '₹113.00 on the screen “Today’s total”.',
    );
    expect(flowOf(twice, 'todays-total/todays-takings~2')!.steps.at(-1)!.sentence).toBe(
      '₹999.00 on the screen “Today’s total”.',
    );
  });

  it('keeps a value from the form as from the form, not a table', () => {
    const f = flowOf(capture, 'new-order/new-order-amount')!;
    expect(f.steps[0]).toMatchObject({ kind: 'source', table: null, file: null, value: '2' });
    expect(f.steps[0]!.sentence).toBe(
      'Cups chosen when the page opens, 2, left the form (not saved yet).',
    );
  });
});
