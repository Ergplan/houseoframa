import { describe, expect, it } from 'vitest';
import { costOf, formatInr, MODEL_PRICES, PRICES_SET_ON, USD_INR } from './prices.ts';

describe('price table', () => {
  it('is dated, sourced, and prices the builder and auditor models in use', () => {
    expect(PRICES_SET_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(USD_INR.source).toMatch(/^.+https:\/\//);
    for (const model of ['claude-sonnet-5-5', 'gpt-6.1-sol']) {
      expect(MODEL_PRICES[model]!.source.length).toBeGreaterThan(10);
    }
  });

  it('turns tokens into dollars and rupees', () => {
    const c = costOf('claude-sonnet-5-5', 1_000_000, 100_000)!;
    expect(c.usd).toBe(3);
    expect(c.inr).toBeCloseTo(3 * USD_INR.rate, 6);
  });

  it('gives no cost for a model without a price, rather than guessing', () => {
    expect(costOf('some-other-model', 10, 10)).toBeNull();
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatInr(123456.4)).toBe('₹1,23,456');
    expect(formatInr(0.4234)).toBe('₹0.42');
  });
});
