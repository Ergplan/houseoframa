import { describe, expect, it } from 'vitest';
import { findBuilding, understand } from './words.ts';

const buildings = [
  { id: 'take-an-order', name: 'Take an order' },
  { id: 'see-orders', name: 'See today’s orders' },
  { id: 'count', name: 'Count the day’s takings' },
];

describe('understand', () => {
  it('opens a building by its name, with or without "open"', () => {
    expect(understand('open Take an order', { level: 'street' }, buildings)).toEqual({
      to: { level: 'building', building: 'take-an-order' },
    });
    expect(understand('Count the takings', { level: 'street' }, buildings)).toEqual({
      to: { level: 'building', building: 'count' },
    });
    expect(
      understand('go to see todays orders', { level: 'code', building: null }, buildings),
    ).toEqual({
      to: { level: 'building', building: 'see-orders' },
    });
  });

  it('goes inside, to the code, and back up a level at a time', () => {
    expect(understand('inside', { level: 'street', selected: 'count' }, buildings)).toEqual({
      to: { level: 'building', building: 'count' },
    });
    expect(understand('inside', { level: 'building', building: 'count' }, buildings)).toEqual({
      to: { level: 'code', building: 'count' },
    });
    expect(
      understand('Show me the code', { level: 'building', building: 'count' }, buildings),
    ).toEqual({
      to: { level: 'code', building: 'count' },
    });
    expect(understand('show me the code', { level: 'street' }, buildings)).toEqual({
      to: { level: 'code', building: null },
    });
    expect(understand('go back', { level: 'code', building: 'count' }, buildings)).toEqual({
      to: { level: 'building', building: 'count' },
    });
    expect(understand('back', { level: 'building', building: 'count' }, buildings)).toEqual({
      to: { level: 'street', selected: 'count' },
    });
  });

  it('answers what it does not know with a sentence, never a guess', () => {
    expect(understand('inside', { level: 'street' }, buildings)).toEqual({
      say: 'Inside which building? Say "open" and its name.',
    });
    expect(understand('open the warehouse', { level: 'street' }, buildings)).toMatchObject({
      say: expect.stringContaining('no building called'),
    });
    expect(understand('back', { level: 'street' }, buildings)).toMatchObject({
      say: expect.stringContaining('Street'),
    });
  });

  it('matches a name only when one building fits every word said', () => {
    expect(findBuilding('take', buildings)?.id).toBe('take-an-order');
    expect(findBuilding('order', buildings)).toBeNull();
    expect(findBuilding('orders', buildings)?.id).toBe('see-orders');
  });
});
