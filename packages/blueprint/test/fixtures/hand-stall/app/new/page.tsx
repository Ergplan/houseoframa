import { Figure } from '../../components/Figure';
import { rupees } from '../../lib/money';
import { previewAmount } from '../../lib/preview';

const CUPS = 2;
const PRICE_PAISE = 1500;

export default function NewOrder() {
  return (
    <main>
      <h1>New order</h1>
      <form>
        <p>
          <label>
            Item <input name="item" defaultValue="Masala chai" />
          </label>
        </p>
        <p>
          <label>
            Cups{' '}
            <select name="cups" defaultValue="two">
              <option value="one">one cup</option>
              <option value="two">two cups</option>
              <option value="three">three cups</option>
            </select>
          </label>
        </p>
        <p>
          This order comes to{' '}
          <Figure
            id="preview-amount"
            args={[CUPS, PRICE_PAISE]}
            value={previewAmount(CUPS, PRICE_PAISE)}
          >
            {rupees(previewAmount(CUPS, PRICE_PAISE))}
          </Figure>
        </p>
        <button type="submit">Take the order</button>
      </form>
    </main>
  );
}
