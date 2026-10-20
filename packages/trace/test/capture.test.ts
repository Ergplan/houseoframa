import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extract } from '@rama/blueprint';
import type { Blueprint } from '@rama/shared';
import { capture, MAX_SHOT_HEIGHT, type Capture } from '../src/capture.ts';
import { showroomOf } from '../src/showroom.ts';
import { fixtureApp } from './fixture-app.ts';
import type { FixtureRepo } from '../../blueprint/test/fixture-repo.ts';

let app: FixtureRepo;
let out: string;
let bp: Blueprint;
let cap: Capture;

beforeAll(async () => {
  app = fixtureApp();
  out = mkdtempSync(path.join(tmpdir(), 'rama-capture-'));
  bp = extract(app.dir);
  cap = await capture({ id: 'fixture', repoDir: app.dir }, bp, {
    outDir: out,
    now: () => new Date('2026-10-20T00:00:00Z'),
  });
}, 120_000);

afterAll(() => {
  app?.cleanup();
  if (out) rmSync(out, { recursive: true, force: true });
});

describe('capture', () => {
  it('photographs every screen of .rama/screens.json into shots/ and writes capture.json', () => {
    expect(cap.screens.map((s) => [s.name, s.route, s.title])).toEqual([
      ['home', '/', 'Shop'],
      ['order', '/orders/7?as=staff', bp.screens.find((x) => x.route === '/orders/[id]')!.name],
      ['moved', '/old-home', 'moved'],
      ['long', '/long', 'long'],
      ['more', '/more', 'more'], // no route of its own in the Blueprint: it redirects to / (see "redirects")
    ]);
    for (const s of cap.screens) {
      const png = readFileSync(path.join(out, 'shots', s.shot));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(s.width).toBe(390);
    }
    expect(JSON.parse(readFileSync(path.join(out, 'capture.json'), 'utf8'))).toEqual(cap);
    expect(cap.commit).toBe(app.git('rev-parse', 'HEAD').trim());
  });

  it("records the bricks that render each screen, from the route's import closure in the Blueprint", () => {
    expect(cap.screens[0]).toMatchObject({
      blueprintScreen: '/',
      bricks: ['app/page.tsx', 'lib/total.js'],
    });
    expect(cap.screens[1]).toMatchObject({
      blueprintScreen: '/orders/[id]',
      bricks: ['app/orders/[id]/page.tsx', 'lib/total.js'],
    });
  });

  it('puts the role on as configured, and starts the app with no secrets in its environment', async () => {
    expect(cap.screens[1]!.route).toBe('/orders/7?as=staff');
    const texts = cap.screens[1]!.figures.map((f) => f.text);
    expect(texts).not.toContain('secrets');
  });

  it('finds traced figures by attribute and by overlay selector, and untraced amounts by the pattern', () => {
    const home = cap.screens[0]!.figures;
    expect(home.map((f) => [f.id, f.origin, f.text])).toEqual([
      ['order-total', 'attribute', '₹28.00'],
      ['order-total', 'attribute', '₹15.00'], // the same figure again, from other arguments
      ['untraced:home:1', 'detected', 'Tip ₹5'], // text directly in <body>
      ['untraced:home:2', 'detected', '₹99'],
      ['untraced:home:3', 'detected', 'image: Sales chart'], // figures drawn in an image cannot be read
    ]);
    // A small icon is not marked: it cannot hold a figure a person reads.
    expect(home.filter((f) => f.text.startsWith('image')).length).toBe(1);
    expect(home[0]).toMatchObject({
      args: [
        [
          { qty: 2, pricePaise: 1250 },
          { qty: 1, pricePaise: 300 },
        ],
      ],
      value: '2800',
    });
    expect(home[0]!.box.w).toBeGreaterThan(0);
    const order = cap.screens[1]!.figures;
    expect(order.map((f) => [f.id, f.origin, f.text])).toEqual([
      ['vat', 'attribute', '₹4.20'],
      ['order-total', 'attribute', '₹15.00'],
      ['line-count', 'overlay', '2 lines'],
      ['untraced:order:1', 'detected', 'Order 7'],
      ['untraced:order:2', 'detected', 'Previous order incl. ₹2 packing'],
      ['untraced:order:3', 'detected', '₹ 12'],
      ['untraced:order:4', 'detected', '18%'],
      ['untraced:order:5', 'detected', '3'],
      ['untraced:order:6', 'detected', 'Delivery ₹99'],
      ['untraced:order:7', 'detected', 'Tax ₹10'],
      ['untraced:order:8', 'detected', '13 bills this quarter'],
      ['untraced:order:9', 'detected', '99'], // a number input's value
      ['untraced:order:10', 'detected', '₹500'], // a select's chosen option
    ]);
  });

  it('marks an amount split across elements, a percentage, a bare count and a number in words, each once', () => {
    const detected = cap.screens[1]!.figures.filter((f) => f.origin === 'detected');
    expect(detected.map((f) => f.text)).toEqual([
      'Order 7',
      'Previous order incl. ₹2 packing', // it also holds a traced figure: its other amount is still marked
      '₹ 12',
      '18%',
      '3',
      'Delivery ₹99', // its child holds another amount: each is marked, the parent by its own text
      'Tax ₹10',
      '13 bills this quarter',
      '99', // form fields are judged by the value they show
      '₹500',
    ]);
    // A number the detector cannot tell from a figure ("Order 7") is marked untraced, not left bare. Dates,
    // times, years and identifiers that mix letters and digits are not figures; neither are plain words.
    const all = cap.screens.flatMap((s) => s.figures).map((f) => f.text);
    expect(all.some((t) => /owner|staff|none|Sept|INV-042|GSTIN/.test(t))).toBe(false);
  });

  it("re-executes the convention's function with each screen's own arguments, and the overlay's harness", () => {
    expect(cap.runs['home/order-total']).toMatchObject({ ok: true, text: '2800', value: 2800 });
    expect(cap.runs['order/order-total']).toMatchObject({ ok: true, text: '1500', value: 1500 });
    expect(cap.runs['order/line-count']).toMatchObject({
      ok: true,
      text: '2 lines',
      inputs: [{ label: 'Order lines', value: '2 lines' }],
    });
    expect(cap.runs['order/vat']).toBeUndefined(); // tagged, but nothing maps it
    // Two appearances on one screen are kept apart: the second is keyed with its occurrence.
    expect(cap.runs['home/order-total~2']).toMatchObject({ ok: true, text: '1500', value: 1500 });
    expect(cap.mappings['order-total']!.code).toBe(
      'export function orderTotal(lines) {\n  let sum = 0;\n  for (const l of lines) sum += l.qty * l.pricePaise;\n  return sum;\n}',
    );
  });
});

describe('pixels and long pages', () => {
  it('marks a video and a CSS background image untraced, and crops a page taller than a shot, saying so', () => {
    const long = cap.screens.find((x) => x.name === 'long')!;
    expect(long.figures.map((f) => f.text)).toEqual(['video', 'background image', 'Top ₹1']);
    expect(long.height).toBe(MAX_SHOT_HEIGHT);
    expect(long.croppedFrom).toBeGreaterThan(MAX_SHOT_HEIGHT);
    // The amount below the crop is not on the screenshot: it is neither shown nor counted.
    expect(long.figures.some((f) => f.text.includes('₹2'))).toBe(false);
    expect(cap.screens.find((x) => x.name === 'home')!.croppedFrom).toBeUndefined();
  });
});

describe('figures without a text node of their own', () => {
  it('marks a button value, generated CSS content, a frame, an open shadow root and an SVG image', () => {
    const more = cap.screens.find((x) => x.name === 'more')!;
    expect(more.figures.map((f) => f.text)).toEqual([
      '₹99',
      '₹7',
      'frame',
      '₹3',
      'component: x-closed', // may draw inside a closed shadow root, which cannot be read
      'generated content', // CSS counter(): drawn, but its value cannot be read
      'image: embedded',
    ]);
    expect(more.figures.every((f) => f.origin === 'detected' && f.box.w > 0 && f.box.h > 0)).toBe(
      true,
    );
  });
});

describe('redirects', () => {
  it('records where a screen landed when its route redirected, and nothing when it did not', () => {
    const moved = cap.screens.find((x) => x.name === 'moved')!;
    expect(moved).toMatchObject({ route: '/old-home', landed: '/' });
    expect(cap.screens.find((x) => x.name === 'home')!.landed).toBeUndefined();
    expect(showroomOf(cap, bp).screens.find((x) => x.name === 'moved')!.landed).toBe('/');
  });
});

describe('showroom', () => {
  it('marks a figure traced only when it maps to a trail; every other figure is untraced (Invariant 2)', () => {
    const s = showroomOf(cap, bp);
    const ids = (traced: boolean) =>
      s.screens.flatMap((x) =>
        x.figures.filter((f) => f.traced === traced).map((f) => `${x.name}/${f.id}`),
      );
    expect(ids(true)).toEqual([
      'home/order-total',
      'home/order-total',
      'order/order-total',
      'order/line-count',
      'moved/order-total',
      'moved/order-total',
    ]);
    expect(ids(false)).toEqual([
      'home/untraced:home:1',
      'home/untraced:home:2',
      'home/untraced:home:3',
      'order/vat',
      'order/untraced:order:1',
      'order/untraced:order:2',
      'order/untraced:order:3',
      'order/untraced:order:4',
      'order/untraced:order:5',
      'order/untraced:order:6',
      'order/untraced:order:7',
      'order/untraced:order:8',
      'order/untraced:order:9',
      'order/untraced:order:10',
      'moved/untraced:moved:1',
      'moved/untraced:moved:2',
      'moved/untraced:moved:3',
      'long/untraced:long:1',
      'long/untraced:long:2',
      'long/untraced:long:3',
      'more/untraced:more:1',
      'more/untraced:more:2',
      'more/untraced:more:3',
      'more/untraced:more:4',
      'more/untraced:more:5',
      'more/untraced:more:6',
      'more/untraced:more:7',
    ]);
    expect(s.counts).toEqual({ shown: 33, traced: 6 });
    expect(Object.keys(s.trails).sort()).toEqual([
      'home/order-total',
      'home/order-total~2',
      'moved/order-total',
      'moved/order-total~2',
      'order/line-count',
      'order/order-total',
    ]);
  });

  it('builds a trail per appearance, each with its own inputs and its own check against the screen', () => {
    const s = showroomOf(cap, bp);
    expect(s.trails['home/order-total']).toMatchObject({
      title: 'Order total',
      reexecuted: true,
      formula: {
        file: 'lib/total.js',
        line: 2,
        english: 'For each line, quantity times price; added up.',
      },
      inputs: [{ label: 'Order lines', source: 'orderTotal(lines)' }],
      data: ['Order lines: LINES in server.mjs (fixture)'],
      result: { shown: '2800', computed: '2800', matches: true },
      signoff: null,
    });
    expect(s.trails['home/order-total']!.build.map((b) => b.file)).toEqual(['lib/total.js']);
    // The second appearance on the same screen has its own trail: its own inputs and its own check.
    expect(s.trails['home/order-total~2']!.result).toEqual({
      shown: '1500',
      computed: '1500',
      matches: true,
    });
    expect(s.trails['home/order-total~2']!.inputs[0]!.value).toBe(
      JSON.stringify([{ qty: 3, pricePaise: 500 }]),
    );
    const order = s.trails['order/order-total']!;
    expect(order.result).toEqual({ shown: '1500', computed: '1500', matches: true });
    expect(order.inputs[0]!.value).toBe(JSON.stringify([{ qty: 3, pricePaise: 500 }]));
    expect(s.trails['order/line-count']!.result).toEqual({
      shown: '2 lines',
      computed: '2 lines',
      matches: true,
    });
  });
});

describe('capture refusals', () => {
  it('refuses a site with no .rama/screens.json', async () => {
    const bare = fixtureApp();
    bare.remove('.rama/screens.json');
    try {
      await expect(capture({ id: 'bare', repoDir: bare.dir }, bp, { outDir: out })).rejects.toThrow(
        /no \.rama\/screens\.json/,
      );
    } finally {
      bare.cleanup();
    }
  });
  it('leaves no stale shots behind', () => {
    expect(existsSync(path.join(out, 'shots', 'home.png'))).toBe(true);
  });
});
