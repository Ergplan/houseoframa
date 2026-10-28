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

describe('understand: the ground (Stage 11)', () => {
  const tables = [
    { name: 'orders', by: ['see-orders', 'take-an-order', 'count'] },
    { name: 'model_calls', by: [] },
  ];
  it('opens a table by its name, before a building whose name holds the word', () => {
    expect(understand('open orders', { level: 'street' }, buildings, tables)).toEqual({
      to: { level: 'ground', table: 'orders' },
    });
    expect(understand('show me the model calls', { level: 'street' }, buildings, tables)).toEqual({
      to: { level: 'ground', table: 'model_calls' },
    });
    // A building's whole name still opens the building.
    expect(understand('open see todays orders', { level: 'street' }, buildings, tables)).toEqual({
      to: { level: 'building', building: 'see-orders' },
    });
  });

  it('"show me the table" opens the one the building in view uses, or asks which', () => {
    expect(
      understand('show me the table', { level: 'building', building: 'count' }, buildings, tables),
    ).toEqual({ to: { level: 'ground', table: 'orders' } });
    expect(understand('show me the table', { level: 'street' }, buildings, tables)).toEqual({
      say: 'Which table? Say "open" and its name: orders, model_calls.',
    });
    expect(understand('show me the table', { level: 'street' }, buildings, [])).toEqual({
      say: 'The product keeps no records of its own yet.',
    });
    expect(understand('show me the table', { level: 'street' }, buildings, [tables[0]!])).toEqual({
      to: { level: 'ground', table: 'orders' },
    });
  });

  it('goes back from a table to the Street', () => {
    expect(understand('go back', { level: 'ground', table: 'orders' }, buildings, tables)).toEqual({
      to: { level: 'street' },
    });
    expect(understand('inside', { level: 'ground', table: 'orders' }, buildings, tables)).toEqual({
      say: 'This is a table of the ground; say "go back" first.',
    });
  });
});
