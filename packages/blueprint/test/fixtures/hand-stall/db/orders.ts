// The day's orders. Until a database is connected the stall reads its sample day, data/orders.json:
// the order fields of the orders table (db/schema.ts), without the provenance a database row carries.
import day from '../data/orders.json';
import type { Order } from '../lib/money';

export function todaysOrders(): Order[] {
  return day.orders;
}
