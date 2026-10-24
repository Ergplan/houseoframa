// The day's orders. Until a database is connected the stall reads its sample day, data/orders.json,
// whose rows have the shape of the orders table (db/schema.ts).
import day from '../data/orders.json';
import type { Order } from '../lib/money';

export function todaysOrders(): Order[] {
  return day.orders;
}
