// The house convention for figures (House of Rama, docs/HOUSE-STYLE.md). Every number a screen shows is
// a figure: an entry of rama/figures.ts naming the function that works it out, and a <Figure> on the
// screen that shows that function's own result. House of Rama reads this file and rama/figures.ts as
// they are written; keep every entry a plain object of plain strings, so it can.

/** How a figure is written on a screen. Rupee amounts are kept in paise (100 paise make a rupee). */
export const SHOW = {
  /** A count, with Indian grouping: 1,23,456. */
  count: (n: number) => n.toLocaleString('en-IN'),
  /** An amount held in paise, written in rupees: ₹1,234.50. */
  rupees: (paise: number) =>
    `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  /** A share held as a percentage: 12.5%. */
  percent: (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`,
} as const;
export type Show = keyof typeof SHOW;

/** One input of a figure: what it is, where it enters the function, and where it is kept. */
export interface FigureInput {
  label: string;
  /** Where the value enters the code: `dayTotal(orders)`, a constant's name. */
  source: string;
  /** Where the value is kept: `orders.cups`, `data/orders.json`, `the form (not saved yet)`. */
  data: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any function of plain values that returns a number
type Formula = (...args: any[]) => number;

export interface FigureDef<F extends Formula = Formula> {
  /** The function that works the figure out: imported, never written here. */
  fn: F;
  /** What the figure is called, in the customer's words. */
  title: string;
  /** What it tells the person reading it, in one sentence. */
  what: string;
  /** How it is worked out, in plain English, as the decision card says it. */
  english: string;
  inputs: FigureInput[];
  show: Show;
  /** Files whose changes belong to the figure's history besides its function's own (data files). */
  files?: string[];
}

/** The figures of the product, by id (lowercase words joined by dashes). */
export function defineFigures<const T extends Record<string, FigureDef>>(defs: T): T {
  return defs;
}
