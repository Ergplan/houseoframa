// A tiny target that follows the house convention (docs/HOUSE-STYLE.md): a Node server renders two
// screens whose figures carry data-rama-figure, data-rama-args and data-rama-value; rama/figures.ts
// maps them to the function in lib/total.js; .rama/screens.json says how to build, start and walk it.
// It also carries one overlay figure (.rama/figures.json with a harness), one figure the convention
// tags but does not map, and one amount nobody tags, so every state of a figure is exercised.
import { fixtureRepo, type FixtureRepo } from '../../blueprint/test/fixture-repo.ts';

const TOTAL_JS = `// The order total in paise: quantity × price per line, summed.
export function orderTotal(lines) {
  let sum = 0;
  for (const l of lines) sum += l.qty * l.pricePaise;
  return sum;
}

export function lineCount(lines) {
  return lines.length;
}

export const rupees = (paise) => '₹' + (paise / 100).toFixed(2);
`;

const SERVER = `import http from 'node:http';
import { orderTotal, lineCount, rupees } from './lib/total.js';

const LINES = [{ qty: 2, pricePaise: 1250 }, { qty: 1, pricePaise: 300 }];
const OTHER = [{ qty: 3, pricePaise: 500 }];
const page = (body) => '<!doctype html><html><body style="margin:0;font:16px sans-serif">' + body + '</body></html>';
const routes = {
  '/': () =>
    page('<h1>Shop</h1><p data-rama-figure="order-total" data-rama-args=\\'' + JSON.stringify([LINES]) + '\\' data-rama-value="' +
      orderTotal(LINES) + '">' + rupees(orderTotal(LINES)) + '</p><p>Delivery <span>₹99</span></p>Tip ₹5' +
      // The same figure again on this screen, from other arguments; a chart image; a small icon.
      '<p>Last order <b data-rama-figure="order-total" data-rama-args=\\'' + JSON.stringify([OTHER]) + '\\' data-rama-value="' +
      orderTotal(OTHER) + '">' + rupees(orderTotal(OTHER)) + '</b></p>' +
      '<img alt="Sales chart" width="200" height="100" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#ddd"/></svg>') + '">' +
      '<img alt="" width="16" height="16" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>') + '">'),
  // Taller than a screenshot may be: a video, a background image, an amount on top and one below the crop.
  '/long': () =>
    page('<video width="200" height="100"></video>' +
      '<div style="width:200px;height:100px;background-image:url(data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>') + ')"></div>' +
      '<div style="height:13000px">Top ₹1</div><p>Bottom ₹2</p>'),
  '/orders/7': (q) =>
    page('<h1>Order 7</h1><p id="count">' + lineCount(LINES) + ' lines</p><p data-rama-figure="vat">₹4.20</p>' +
      '<p id="role">' + (q.get('as') ?? 'owner') + '</p><p id="env">' + (process.env.DATABASE_URL || process.env.OPENAI_API_KEY ? 'secrets' : 'none') + '</p>' +
      '<p>Previous order <span data-rama-figure="order-total" data-rama-args=\\'' + JSON.stringify([OTHER]) + '\\' data-rama-value="' +
      orderTotal(OTHER) + '">' + rupees(orderTotal(OTHER)) + '</span> incl. ₹2 packing</p>' +
      '<p class="hero"><span>₹</span><span>12</span></p><p>GST <i>18%</i></p><p>Items <b>3</b></p>' +
      '<p>Delivery ₹99 <span>Tax ₹10</span></p><p>13 bills this quarter</p><p>Issued 22 Sept 2026 at 10:30 (22/09)</p><p>Invoice INV-042, GSTIN 27AAPFU0939F1ZV</p>' +
      '<p><input type="number" value="99"> <input value="Asha"> <select><option>₹500</option></select></p>'),
};
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const route = routes[url.pathname];
    if (url.pathname === '/old-home') {
      res.writeHead(302, { location: '/' });
      res.end();
      return;
    }
    res.writeHead(route ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(route ? route(url.searchParams) : 'not found');
  })
  .listen(Number(process.env.PORT));
`;

export function fixtureApp(): FixtureRepo {
  const repo = fixtureRepo();
  repo.write({
    'package.json': JSON.stringify({
      name: 'fixture-app',
      type: 'module',
      scripts: { build: 'node build.mjs', start: 'node server.mjs' },
    }),
    'next.config.mjs': 'export default {};\n', // marks a house-stack app, so the Blueprint finds its screens
    'build.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('built.txt', 'ok');\n",
    'server.mjs': SERVER,
    'lib/total.js': TOTAL_JS,
    'app/page.tsx':
      "import { orderTotal } from '../lib/total.js';\nexport default function Home() { return orderTotal([]); }\n",
    'app/orders/[id]/page.tsx':
      "import { lineCount } from '../../../lib/total.js';\nexport default function Order() { return lineCount([]); }\n",
    'rama/figures.ts': `// The house convention: every traced figure on a screen, mapped to the function that computes it.
export const figures = {
  'order-total': {
    fn: 'orderTotal',
    file: 'lib/total.js',
    line: 2,
    title: 'Order total',
    what: 'What the customer pays for the order, before delivery.',
    english: 'For each line, quantity times price; added up.',
    inputs: [{ label: 'Order lines', source: 'orderTotal(lines)', data: 'LINES in server.mjs (fixture)' }],
  },
};
`,
    '.gitignore': 'built.txt\n',
    '.rama/screens.json': JSON.stringify({
      app: { install: 'true', build: 'node build.mjs', start: 'node server.mjs', ready: '/' },
      viewport: { width: 390, height: 500 },
      roles: { staff: { query: 'as=staff' } },
      screens: [
        { name: 'home', title: 'Shop', route: '/' },
        { name: 'order', route: '/orders/7', role: 'staff', steps: [{ waitFor: 'h1' }] },
        { name: 'moved', route: '/old-home' },
        { name: 'long', route: '/long' },
      ],
    }),
    '.rama/figures.json': JSON.stringify({
      'line-count': {
        fn: 'lineCount',
        file: 'lib/total.js',
        line: 8,
        title: 'Lines on the order',
        what: 'How many lines the order has.',
        english: 'The number of lines.',
        inputs: [
          {
            label: 'Order lines',
            source: 'lineCount(lines)',
            data: 'LINES in server.mjs (fixture)',
          },
        ],
        screen: ['order'],
        selector: '#count',
        run: '.rama/trails/line-count.mjs',
      },
    }),
    '.rama/trails/line-count.mjs': `import { lineCount } from '../../lib/total.js';
const LINES = [{ qty: 2, pricePaise: 1250 }, { qty: 1, pricePaise: 300 }];
const OTHER = [{ qty: 3, pricePaise: 500 }];
export default function run() {
  const n = lineCount(LINES);
  return { text: n + ' lines', value: n, inputs: [{ label: 'Order lines', value: LINES.length + ' lines' }] };
}
`,
  });
  repo.commit('the fixture app');
  return repo;
}
