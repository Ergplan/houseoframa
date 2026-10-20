import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { addSite } from '@rama/blueprint/site';
import type { Capture } from '@rama/trace';
import {
  fixtureRepo,
  type FixtureRepo,
} from '../../../../../../packages/blueprint/test/fixture-repo';
import Showroom from './page';
import { shotResponse } from '../../../api/site/[siteId]/shots/[name]/shot';

let repo: FixtureRepo;
let work: string;
const original = process.env.RAMA_WORK_DIR;
const params = (siteId: string, q: Record<string, string> = {}) => ({
  params: Promise.resolve({ siteId }),
  searchParams: Promise.resolve(q),
});
const render = async (siteId: string, q: Record<string, string> = {}) =>
  renderToStaticMarkup(await Showroom(params(siteId, q)));

beforeAll(() => {
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/total.js': 'export function orderTotal(lines) {\n  return lines.length;\n}\n',
    'app/page.tsx':
      "import { orderTotal } from '../lib/total.js';\nexport default function Home() { return orderTotal([]); }\n",
  });
  repo.commit('first');
  work = mkdtempSync(path.join(tmpdir(), 'rama-showroom-'));
  process.env.RAMA_WORK_DIR = work;
  addSite(repo.dir, { id: 'shop', name: 'Shop', env: process.env });
  const capture: Capture = {
    version: 1,
    site: 'shop',
    commit: repo.git('rev-parse', 'HEAD').trim(),
    capturedAt: '2026-10-20T12:00:00.000Z',
    viewport: { width: 390, height: 844 },
    screens: [
      {
        name: 'home',
        title: 'Shop',
        route: '/',
        role: null,
        shot: 'home.png',
        width: 390,
        height: 600,
        blueprintScreen: '/',
        bricks: ['app/page.tsx', 'lib/total.js'],
        figures: [
          {
            id: 'order-total',
            origin: 'attribute',
            text: '₹28.00',
            box: { x: 10, y: 60, w: 100, h: 24 },
            args: [[1, 2]],
            value: '2',
          },
          {
            id: 'untraced:home:1',
            origin: 'detected',
            text: '₹99',
            box: { x: 10, y: 120, w: 40, h: 20 },
          },
        ],
      },
    ],
    mappings: {
      'order-total': {
        origin: 'convention',
        fn: 'orderTotal',
        file: 'lib/total.js',
        line: 1,
        files: [],
        title: 'Order total',
        what: 'What the customer pays.',
        english: 'One per line.',
        inputs: [{ label: 'Order lines', source: 'orderTotal(lines)', data: 'LINES (fixture)' }],
        code: 'export function orderTotal(lines) {\n  return lines.length;\n}',
      },
    },
    runs: {
      'home/order-total': {
        ok: true,
        text: '2',
        value: 2,
        inputs: [{ label: 'Order lines', value: '[1,2]' }],
      },
    },
  };
  writeFileSync(path.join(work, 'shop', 'capture.json'), JSON.stringify(capture));
  mkdirSync(path.join(work, 'shop', 'shots'), { recursive: true });
  writeFileSync(
    path.join(work, 'shop', 'shots', 'home.png'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );
});

afterAll(() => {
  if (original === undefined) delete process.env.RAMA_WORK_DIR;
  else process.env.RAMA_WORK_DIR = original;
  repo?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

describe('route /site/[siteId]/showroom', () => {
  it('shows the real screen with a hotspot per figure, and the honest rate of traced figures', async () => {
    const html = await render('shop');
    expect(html).toContain('<b>1 of 2</b>');
    expect(html).toContain('src="/api/site/shop/shots/home.png"');
    expect(html).toContain('aria-label="Traced figure ₹28.00: open its trail"');
    expect(html).toMatch(
      /class="hot" data-figure="order-total" data-key="home\/order-total" data-traced="true"/,
    );
    expect(html).toContain('left:2.564102564102564%');
  });

  it('renders an untraced figure in the untraced state (Invariant 2)', async () => {
    const html = await render('shop', { figure: 'untraced:home:1' });
    expect(html).toMatch(
      /class="hot untraced on" data-figure="untraced:home:1" data-key="home\/untraced:home:1" data-traced="false"/,
    );
    expect(html).toContain('aria-label="Untraced figure ₹99"');
    expect(html).toContain('<h2>Untraced figure</h2>');
    expect(html).toContain('shown as untraced rather than explained by a guess');
  });

  it("opens a traced figure's trail in five sections, with the re-execution checked against the screen", async () => {
    const html = await render('shop', { figure: 'order-total' });
    for (const h of [
      '1 · Formula',
      '2 · Inputs',
      '3 · Where the data lives',
      '4 · Build trail',
      '5 · Review &amp; sign-off',
    ]) {
      expect(html).toContain(`<h4>${h}</h4>`);
    }
    expect(html).toContain('Re-executed: matches the screen.');
    expect(html).toContain('export function orderTotal(lines) {');
    expect(html).toMatch(/<code>lib\/total\.js(<!-- -->)?:(<!-- -->)?1<\/code>/);
    expect(html).toContain('Order lines: LINES (fixture)');
    expect(html).toContain('Not signed. Signatures arrive in Stage 4');
  });

  it('says no screens were captured, rather than showing a mock-up, for a site without a capture', async () => {
    expect(await render('self')).toContain('No screens have been captured for this site yet');
  });

  it('is not found for an unknown site', async () => {
    await expect(Showroom(params('nope'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

describe('route /api/site/[siteId]/shots/[name]', () => {
  it('serves a captured screenshot as PNG', async () => {
    const res = shotResponse('shop', 'home.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(
      Buffer.from(await res.arrayBuffer())
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  });

  it('refuses anything that is not a screenshot of a known site', () => {
    expect(shotResponse('shop', '../capture.json').status).toBe(404);
    expect(shotResponse('shop', 'missing.png').status).toBe(404);
    expect(shotResponse('nope', 'home.png').status).toBe(404);
    expect(shotResponse('shop', 'home.PNG').status).toBe(404);
  });
});
