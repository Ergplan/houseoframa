// The house convention (House of Rama, docs/HOUSE-STYLE.md): every figure on a screen, mapped to the
// function that computes it, with where its inputs live.
export const figures = {
  'order-count': {
    fn: 'orderCount',
    file: 'lib/money.ts',
    line: 15,
    title: 'Orders so far',
    what: 'How many orders the stall has taken today.',
    english: 'The number of orders taken today.',
    inputs: [
      { label: 'Today’s orders', source: 'orderCount(orders)', data: 'orders (one row each)' },
    ],
    files: ['data/orders.json'],
  },
  'order-amount': {
    fn: 'orderAmount',
    file: 'lib/money.ts',
    line: 10,
    title: 'Order amount',
    what: 'What one order costs the customer.',
    english: 'Cups times the price of a cup.',
    inputs: [
      { label: 'Cups', source: 'orderAmount(cups, …)', data: 'orders.cups' },
      { label: 'Price of a cup', source: 'orderAmount(…, pricePaise)', data: 'orders.price_paise' },
    ],
    files: ['data/orders.json'],
  },
  'preview-amount': {
    fn: 'previewAmount',
    file: 'lib/preview.ts',
    line: 5,
    title: 'New order amount',
    what: 'What the order being written will cost, before it is saved.',
    english: 'Whole cups times the price of a cup.',
    inputs: [
      { label: 'Cups', source: 'previewAmount(cups, …)', data: 'the form (not saved yet)' },
      {
        label: 'Price of a cup',
        source: 'PRICE_PAISE in app/new/page.tsx',
        data: 'app/new/page.tsx (constant)',
      },
    ],
  },
  'day-total': {
    fn: 'dayTotal',
    file: 'lib/money.ts',
    line: 20,
    title: 'Today’s takings',
    what: 'Everything the stall took today.',
    english: 'Every order’s amount, added up.',
    inputs: [
      {
        label: 'Today’s orders',
        source: 'dayTotal(orders)',
        data: 'orders.cups, orders.price_paise',
      },
    ],
    files: ['data/orders.json'],
  },
  'day-gst': {
    fn: 'dayGst',
    file: 'lib/money.ts',
    line: 27,
    title: 'GST on today’s takings',
    what: 'The tax owed on today’s takings.',
    english: 'Five percent of the day’s takings, rounded to the paisa.',
    inputs: [
      { label: 'Today’s takings', source: 'dayGst(totalPaise)', data: 'computed: day-total' },
    ],
  },
};
