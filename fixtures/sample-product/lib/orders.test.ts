import { expect, it } from 'vitest';
import { todaysOrders } from '../db/orders';
import { orderCount } from './money';

it('counts the sample day’s orders', () => {
  expect(orderCount(todaysOrders())).toBe(4);
});
