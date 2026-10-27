// Trail fixtures for the track by voice: "Today’s takings" of the sample stall as its trail stands after
// the build (formula, inputs re-executed, the data file, the commits, a signature), "GST on today’s
// takings" unsigned, and a figure with no trail at all.
import type { Trail } from '@rama/shared';
import type { FigureOnHand } from '../src/track.ts';

export const TAKINGS: Trail = {
  figureId: 'todays-takings',
  title: 'Today’s takings',
  what: 'Everything the stall took today.',
  formula: {
    english: 'every order’s amount, added up',
    code: 'export function dayTotal(orders) { … }',
    file: 'features/total/plan.ts',
    line: 12,
  },
  inputs: [{ label: 'the day’s orders', value: '4 orders', source: 'dayTotal(orders)' }],
  data: ['the day’s orders: data/orders.json'],
  build: [
    {
      sha: 'c4',
      at: '2026-10-25T12:20:00Z',
      author: 'Claude Code',
      subject: 'Count the day’s takings: the Today’s total screen with takings and GST',
      file: 'features/total/plan.ts',
    },
    {
      sha: 'c4',
      at: '2026-10-25T12:20:00Z',
      author: 'Claude Code',
      subject: 'Count the day’s takings: the Today’s total screen with takings and GST',
      file: 'data/orders.json',
    },
    {
      sha: 'c1',
      at: '2026-10-25T12:05:00Z',
      author: 'Claude Code',
      subject: 'See today’s orders',
      file: 'data/orders.json',
    },
  ],
  signoff: {
    id: 's1',
    siteId: 'chai',
    person: 'Asha Rao',
    target: { kind: 'screen', id: '/total', commit: 'c4' },
    statement: 'The day’s total is right.',
    at: '2026-10-26T09:00:00Z',
  },
  reexecuted: true,
  result: { shown: '₹113.00', computed: '₹113.00', matches: true },
};

export const GST: Trail = {
  ...TAKINGS,
  figureId: 'gst-on-takings',
  title: 'GST on today’s takings',
  formula: {
    ...TAKINGS.formula,
    english: 'five percent of the day’s takings, rounded to the paisa',
    line: 20,
  },
  signoff: null,
  result: { shown: '₹5.65', computed: '₹5.65', matches: true },
};

export const ON_HAND: (FigureOnHand & { building: string })[] = [
  {
    key: 'total/todays-takings',
    name: 'Today’s takings',
    screen: 'Today’s total',
    trail: TAKINGS,
    building: 'count',
  },
  {
    key: 'total/gst-on-takings',
    name: 'GST on today’s takings',
    screen: 'Today’s total',
    trail: GST,
    building: 'count',
  },
  { key: 'home/tip', name: 'Tip jar', screen: 'Today’s orders', trail: null, building: 'see' },
];
