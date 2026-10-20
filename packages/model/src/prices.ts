// The price table for the models in use, so a stage report can state cost in rupees (member's request,
// DECISIONS 2026-10-20). One place, dated. A model not listed has no price: its cost is shown as
// unknown, never guessed. Update the date and the sources whenever a figure changes.

export const PRICES_SET_ON = '2026-10-20';

/** Rupees per US dollar used for conversion, and where it came from. */
export const USD_INR = {
  rate: 94.92,
  on: '2026-10-19',
  source:
    'Rupee close against the US dollar, 19 Oct 2026 (provisional), as reported by Deccan Herald: https://www.deccanherald.com/business/markets/rupee-falls-3-paise-to-close-at-9492-against-us-dollar-4188085',
} as const;

export interface ModelPrice {
  /** US dollars per million input tokens (standard, uncached, short context). */
  inputUsdPerM: number;
  /** US dollars per million output tokens. */
  outputUsdPerM: number;
  source: string;
  /** True when read from the vendor's own price list; false when only third-party pages agree on it. */
  fromVendor: boolean;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-5-5': {
    inputUsdPerM: 2,
    outputUsdPerM: 10,
    source: "Anthropic's model table (Claude API reference, cached 2026-10-06): $2 / $10 per MTok",
    fromVendor: true,
  },
  'gpt-6.1-sol': {
    inputUsdPerM: 2,
    outputUsdPerM: 10,
    source:
      "Third-party price lists agree on $2 / $10 per 1M tokens (e.g. https://www.datacamp.com/blog/gpt-6-1-sol, https://www.morphllm.com/openai-api-pricing); OpenAI's own pricing page refused automated access on 2026-10-20",
    fromVendor: false,
  },
};

export interface Cost {
  usd: number;
  inr: number;
}

/** Cost of a number of tokens on a model, or null when the model has no price in the table. */
export function costOf(model: string, inputTokens: number, outputTokens: number): Cost | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const usd = (inputTokens * p.inputUsdPerM + outputTokens * p.outputUsdPerM) / 1_000_000;
  return { usd, inr: usd * USD_INR.rate };
}

/** "₹1,234" (whole rupees, Indian grouping); "₹0.42" below one rupee. */
export function formatInr(inr: number): string {
  if (inr < 1) return `₹${inr.toFixed(2)}`;
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}
