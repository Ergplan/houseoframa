// The sample product of Test drive (rule 16), the Chai Stall, as decision cards: what the owner said
// yes to, in their words. The builder builds it from these on the house stack, like any product
// (Stage 9); nothing of the stall is written by hand any more. The cards stand in for discovery's yes.
import path from 'node:path';
import { homeDir } from '@rama/db';

export const SAMPLE_NAME = 'Chai Stall (Test drive)';
export const SAMPLE_IDEA =
  'A chai stall takes orders through the day and sees the day’s takings and GST.';

/** The recording Test drive replays when no builder can run (fixtures/sample-build). */
export const sampleRecording = (env: NodeJS.ProcessEnv = process.env) =>
  path.join(homeDir(env), 'fixtures/sample-build');

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
      'Until a database is connected, the stall reads its sample day from a file: four orders. Masala chai, two cups at 1,500 paise a cup. Ginger chai, one cup at 1,800 paise. Masala chai, three cups at 1,500 paise. Lemon tea, one cup at 2,000 paise. The orders table keeps each order’s item, cups and price of a cup, with when it was taken.',
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
      'It does not save an order, take a payment, print a bill or keep more than one day: no database is connected yet. It has no sign-in.',
  },
];
