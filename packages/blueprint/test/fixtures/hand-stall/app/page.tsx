import { Figure } from '../components/Figure';
import { todaysOrders } from '../db/orders';
import { orderAmount, orderCount, rupees } from '../lib/money';

// Cups in words: a bare number on a screen reads as a figure, and this one is not worth a trail.
const CUPS = ['no cups', 'one cup', 'two cups', 'three cups', 'four cups', 'five cups'];
const cupsInWords = (n: number) => CUPS[n] ?? 'many cups';

export default function Orders() {
  const orders = todaysOrders();
  return (
    <main>
      <h1>Today’s orders</h1>
      <p>
        <Figure id="order-count" args={[orders]} value={orderCount(orders)}>
          {orderCount(orders)}
        </Figure>{' '}
        orders so far
      </p>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {o.item}, {cupsInWords(o.cups)}:{' '}
            <Figure
              id="order-amount"
              args={[o.cups, o.pricePaise]}
              value={orderAmount(o.cups, o.pricePaise)}
            >
              {rupees(orderAmount(o.cups, o.pricePaise))}
            </Figure>
          </li>
        ))}
      </ul>
    </main>
  );
}
