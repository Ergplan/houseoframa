import { Figure } from '../../components/Figure';
import { todaysOrders } from '../../db/orders';
import { dayGst, dayTotal, rupees } from '../../lib/money';

export default function Total() {
  const orders = todaysOrders();
  const total = dayTotal(orders);
  const gst = dayGst(total);
  return (
    <main>
      <h1>Today’s total</h1>
      <p>
        Takings{' '}
        <Figure id="day-total" args={[orders]} value={total}>
          {rupees(total)}
        </Figure>
      </p>
      <p>
        GST, at five percent{' '}
        <Figure id="day-gst" args={[total]} value={gst}>
          {rupees(gst)}
        </Figure>
      </p>
    </main>
  );
}
