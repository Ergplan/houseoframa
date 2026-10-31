// The sample product of Test drive (rule 16), the Chai Stall, as decision cards: what the owner said
// yes to, in their words. The builder builds it from these on the house stack, like any product
// (Stage 9; rebuilt in Stage 11 to keep its orders in its own database); nothing of the stall is written
// by hand any more. The cards stand in for discovery's yes.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { homeDir } from '@rama/db';

export const SAMPLE_NAME = 'Chai Stall (Test drive)';
export const SAMPLE_IDEA =
  'A chai stall takes orders through the day and sees the day’s takings and GST.';

/**
 * The recording Test drive replays when no builder can run (fixtures/sample-build); an engineer or a test
 * may point RAMA_SAMPLE_RECORDING at another recording (fixtures/sample-build-bill, Read my bill).
 */
export const sampleRecording = (env: NodeJS.ProcessEnv = process.env) =>
  env.RAMA_SAMPLE_RECORDING || path.join(homeDir(env), 'fixtures/sample-build');

export const SAMPLE_CARDS: { title: string; statement: string }[] = [
  { title: 'Build the chai stall', statement: SAMPLE_IDEA },
  {
    title: 'Money is kept in paise',
    statement:
      'Every amount is kept in paise (100 paise make a rupee) and shown in rupees with two places, like ₹45.00.',
  },
  {
    title: 'The sample day',
    statement:
      'The stall keeps its orders in its database, in the orders table: each order’s item, cups and price of a cup, with when it was taken. It keeps one day, so every order in the table is today’s. The first time the stall opens with no orders in the table, it writes in the sample day: four orders. Masala chai, two cups at 1,500 paise a cup. Ginger chai, one cup at 1,800 paise. Masala chai, three cups at 1,500 paise. Lemon tea, one cup at 2,000 paise. Without a database (its tests), it reads the same four orders from a file.',
  },
  {
    title: 'Building: See today’s orders',
    statement:
      'Building “See today’s orders”: lists every order the stall has taken today, what each one costs, and how many there are. Its screen is the stall’s first page (/), for the customer, titled “Today’s orders”. It shows “Orders so far”: the number of orders taken today. Then each order’s item, its cups in words (“two cups”), and its “Order amount”: cups times the price of a cup.',
  },
  {
    title: 'Building: Take an order',
    statement:
      'Building “Take an order”: writes down a new order and shows what it will cost before it is saved. Its screen is /new, for the customer, titled “New order”: the item (Masala chai to start with) and the cups (one, two or three cups, two to start with), and “New order amount”: whole cups times the price of a cup, at 1,500 paise a cup, for the cups chosen when the page opens. A button “Take the order”.',
  },
  {
    title: 'Building: Count the day’s takings',
    statement:
      'Building “Count the day’s takings”: adds up everything the stall took today and the GST owed on it. Its screen is /total, for the staff, titled “Today’s total”. It shows “Today’s takings”: every order’s amount, added up; and “GST on today’s takings”: five percent of the day’s takings, rounded to the paisa.',
  },
  {
    title: 'What it will not do',
    statement:
      'It does not save a new order yet, take a payment, print a bill or keep more than one day. It has no sign-in.',
  },
];

/** A sample product for Test drive: its name, its idea, its cards and how many screens it has. */
export interface Sample {
  name: string;
  idea: string;
  cards: { title: string; statement: string }[];
  screens: number;
  /** The state each screen ends Test drive in, by route: customer screens Confirmed, staff ones Verified. */
  states: Record<string, 'Confirmed' | 'Verified'>;
}

export const CHAI_STALL: Sample = {
  name: SAMPLE_NAME,
  idea: SAMPLE_IDEA,
  cards: SAMPLE_CARDS,
  screens: 3,
  states: { '/': 'Confirmed', '/new': 'Confirmed', '/total': 'Verified' },
};

/**
 * The sample a recording was made of (Stage 13): its `sample.json` (name, idea, cards, screens, states) when the
 * recording carries one, else the Chai Stall, which the first recording is of.
 */
export function sampleOf(recordingDir: string): Sample {
  const f = path.join(recordingDir, 'sample.json');
  if (!existsSync(f)) return CHAI_STALL;
  const s = JSON.parse(readFileSync(f, 'utf8')) as Sample;
  return { name: s.name, idea: s.idea, cards: s.cards, screens: s.screens, states: s.states };
}
