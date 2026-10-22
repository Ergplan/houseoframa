import { describe, expect, it } from 'vitest';
import type { Decision, Signoff } from '@rama/shared';
import type { Showroom } from '@rama/trace/showroom';
import { walkthrough } from '../src/walkthrough.ts';

const box = { x: 0, y: 0, w: 10, h: 10 };
const showroom = {
  site: 'shop',
  commit: 'c2c2c2c2c2',
  capturedAt: '2026-10-22T00:00:00Z',
  counts: { shown: 4, traced: 2 },
  screens: [
    {
      name: 'help',
      title: 'Help',
      route: '/help',
      role: null,
      shot: 'help.png',
      width: 390,
      height: 600,
      blueprintScreen: '/help',
      bricks: ['a'],
      figures: [],
    },
    {
      name: 'bill-1',
      title: 'Bill 1',
      route: '/bills/1',
      role: null,
      shot: 'bill-1.png',
      width: 390,
      height: 600,
      blueprintScreen: '/bills/[id]',
      bricks: ['b'],
      figures: [
        { id: 'bill-total', box, traced: true, text: '₹10' },
        { id: 'untraced:bill-1:1', box, traced: false, text: '₹3' },
      ],
    },
    {
      name: 'bill-2',
      title: 'Bill 2',
      route: '/bills/2',
      role: null,
      shot: 'bill-2.png',
      width: 390,
      height: 600,
      blueprintScreen: '/bills/[id]',
      bricks: ['b'],
      figures: [{ id: 'bill-total', box, traced: true, text: '₹20' }],
    },
    {
      name: 'nowhere',
      title: 'Moved',
      route: '/old',
      role: null,
      shot: 'x.png',
      width: 390,
      height: 600,
      blueprintScreen: null,
      bricks: [],
      figures: [],
    },
  ],
  trails: {
    'bill-1/bill-total': {
      title: 'Bill total',
      result: { shown: '₹10', computed: '₹10', matches: true },
    },
    'bill-2/bill-total': {
      title: 'Bill total',
      result: { shown: '₹20', computed: '₹20', matches: true },
    },
  },
} as unknown as Showroom;

const card = (over: Partial<Decision>): Decision => ({
  id: 'd1',
  siteId: 'shop',
  title: 'Totals in rupees',
  statement: 'Totals are whole rupees.',
  bricks: [],
  screenId: '/bills/[id]',
  status: 'decided',
  by: 'Asha',
  at: '2026-10-01T00:00:00Z',
  ...over,
});
const sig = (over: Partial<Signoff>): Signoff => ({
  id: 's1',
  siteId: 'shop',
  person: 'Asha',
  target: { kind: 'screen', id: '/help', commit: 'c2c2c2c2c2' },
  statement: 'ok',
  at: '2026-10-22T01:00:00Z',
  ...over,
});

describe('walkthrough', () => {
  const decisions = [
    card({}),
    card({ id: 'd2', statement: 'Old wording.', status: 'decided' }),
    card({ id: 'd3', supersedes: 'd2', statement: 'Totals are whole rupees, rounded half up.' }),
    card({ id: 'd4', statement: 'Not built yet.', status: 'not-built' }),
  ];
  const steps = walkthrough(
    showroom,
    decisions,
    [sig({}), sig({ id: 's2', target: { kind: 'screen', id: '/bills/[id]', commit: 'old1234' } })],
    'Asha Rao',
  );

  it('makes one step per screen a signature names, traced screens first, captured views together', () => {
    expect(steps.map((s) => [s.screenId, s.views.map((v) => v.name)])).toEqual([
      ['/bills/[id]', ['bill-1', 'bill-2']],
      ['/help', ['help']],
    ]);
    expect(steps.every((s) => s.person === 'Asha Rao')).toBe(true);
  });

  it('builds the statement from the traced figures and the decided cards in force, never from a model', () => {
    expect(steps[0]!.statement).toBe(
      'On /bills/[id] (Bill 1, Bill 2): Bill total shows ₹10. Bill total shows ₹20. Totals are whole rupees. Totals are whole rupees, rounded half up. I have looked at this screen and it shows what I expect.',
    );
    expect(steps[0]!.figures.map((f) => f.key)).toEqual(['bill-1/bill-total', 'bill-2/bill-total']);
    expect(steps[1]!.statement).toBe(
      'On /help (Help): I have looked at this screen and it shows what I expect.',
    );
  });

  it('shows a screen signed at the captured commit as signed, and one signed at another commit as needing a new signature', () => {
    expect(steps[1]!.signature?.id).toBe('s1');
    expect(steps[0]!.signature).toBeNull();
    expect(steps[0]!.staleSignature?.id).toBe('s2');
  });
});
