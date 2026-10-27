// The command grammar (Stage 10): each command and each track question, said the ways people say them,
// and talk that only looks like a command left as talk.
import { describe, expect, it } from 'vitest';
import { matchName, parseCommand } from '../src/grammar.ts';
import { numbersIn, spokenNumber } from '../src/numbers.ts';

describe('the command grammar', () => {
  it.each([
    ['Yes.', { kind: 'yes' }],
    ['yeah', { kind: 'yes' }],
    ['Yes, build it.', { kind: 'yes' }],
    ['Okay, yes please', { kind: 'yes' }],
    ['That’s right.', { kind: 'yes' }],
    ['No.', { kind: 'no' }],
    ['Not yet', { kind: 'no' }],
    ['Scrap everything.', { kind: 'scrap' }],
    ['scrap it all and start again', { kind: 'scrap' }],
    ['Show me the code.', { kind: 'code' }],
    ['Go back', { kind: 'back' }],
    ['Read the board, please.', { kind: 'board' }],
    ['Show me Count the day’s takings.', { kind: 'show', building: "count the day's takings" }],
    ['Take me to the take an order building', { kind: 'show', building: 'take an order' }],
    ['Open the New order screen.', { kind: 'open', screen: 'new order' }],
    ['What if the cups were three?', { kind: 'what-if', input: 'cups', value: 'three' }],
    ['what if price of a cup is 2000', { kind: 'what-if', input: 'price of a cup', value: '2000' }],
  ])('%s', (said, cmd) => expect(parseCommand(said)).toEqual(cmd));

  it.each([
    ['Where does this number come from?', 'from', null],
    ['Where does Today’s takings come from?', 'from', "today's takings"],
    ['How is it worked out?', 'how', null],
    ['How is GST on today’s takings calculated?', 'how', "gst on today's takings"],
    ['What goes into it?', 'inputs', null],
    ['What goes into the order amount?', 'inputs', 'order amount'],
    ['Where is it kept?', 'kept', null],
    ['Who built this?', 'built', null],
    ['Who signed that?', 'signed', null],
    ['Who signed Orders so far?', 'signed', 'orders so far'],
  ])('a track question: %s', (said, step, figure) =>
    expect(parseCommand(said)).toEqual({ kind: 'track', step, figure }),
  );

  it.each([
    'Yes, and it should also print a bill.',
    'No sign-in, please, it is just me at the stall.',
    'A chai stall takes orders through the day.',
    'Show me',
  ])('leaves talk as talk: %s', (said) =>
    expect(parseCommand(said)).toEqual({ kind: 'talk', text: said }),
  );
});

describe('names and numbers as spoken', () => {
  const buildings = [
    { name: 'See today’s orders' },
    { name: 'Take an order' },
    { name: 'Count the day’s takings' },
  ];
  it('matches a spoken name to one building, or to none', () => {
    expect(matchName("count the day's takings", buildings, (b) => b.name)).toBe(buildings[2]);
    expect(matchName('take an order', buildings, (b) => b.name)).toBe(buildings[1]);
    expect(matchName('order', buildings, (b) => b.name)).toBeNull(); // two hold it
    expect(matchName('payroll', buildings, (b) => b.name)).toBeNull();
  });

  it('reads numbers said in words or written in digits', () => {
    expect(spokenNumber('three')).toBe(3);
    expect(spokenNumber('fifteen hundred')).toBe(1500);
    expect(spokenNumber('one thousand five hundred')).toBe(1500);
    expect(spokenNumber('₹30')).toBe(30);
    expect(spokenNumber('two thousand paise')).toBe(2000);
    expect(spokenNumber('a few')).toBeNull();
    expect(numbersIn('Two cups at 1,500 paise a cup: ₹30.00, and GST of five percent.')).toEqual([
      2, 1500, 30, 5,
    ]);
    expect(numbersIn('A cup is a cup; it costs one hundred and twenty rupees')).toEqual([120]);
  });
});
