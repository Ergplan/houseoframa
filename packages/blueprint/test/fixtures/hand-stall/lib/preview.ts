// What a new order will cost, shown while it is being written, before it is saved.
import { orderAmount } from './money';

/** Whole cups only: a part-cup is not sold. */
export function previewAmount(cups: number, pricePaise: number): number {
  return orderAmount(Math.max(0, Math.floor(cups)), pricePaise);
}
