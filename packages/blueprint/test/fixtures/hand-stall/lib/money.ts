// Money on the chai stall, in paise (100 paise make a rupee).
export interface Order {
  id: number;
  item: string;
  cups: number;
  pricePaise: number;
}

/** What one order costs: cups times the price of a cup. */
export function orderAmount(cups: number, pricePaise: number): number {
  return cups * pricePaise;
}

/** How many orders were taken. */
export function orderCount(orders: Order[]): number {
  return orders.length;
}

/** The day's takings: every order's amount, added up. */
export function dayTotal(orders: Order[]): number {
  let sum = 0;
  for (const o of orders) sum += orderAmount(o.cups, o.pricePaise);
  return sum;
}

/** GST on the day's takings at five percent, rounded to the paisa. */
export function dayGst(totalPaise: number): number {
  return Math.round((totalPaise * 5) / 100);
}

export const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
