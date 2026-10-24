import { describe, expect, it } from 'vitest';
import { dayGst, dayTotal, orderAmount } from './money';

describe('money', () => {
  it('an order costs cups times the price of a cup', () => {
    expect(orderAmount(3, 1500)).toBe(4500);
  });

  it('the day’s total adds every order, and GST is five percent of it', () => {
    const orders = [
      { id: 1, item: 'Masala chai', cups: 2, pricePaise: 1500 },
      { id: 2, item: 'Lemon tea', cups: 1, pricePaise: 2000 },
    ];
    expect(dayTotal(orders)).toBe(5000);
    expect(dayGst(5000)).toBe(250);
  });
});
