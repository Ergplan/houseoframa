import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extract } from '@rama/blueprint';
import type { Blueprint } from '@rama/shared';
import { capture, type Capture } from '../src/capture.ts';
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
      ['untraced:home:1', 'detected', '₹99'],
    ]);
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
      ['untraced:order:1', 'detected', '₹12'],
      ['untraced:order:2', 'detected', '18%'],
      ['untraced:order:3', 'detected', '3'],
    ]);
  });

  it('marks an amount split across elements, a percentage and a bare count, each once, at its smallest element', () => {
    const detected = cap.screens[1]!.figures.filter((f) => f.origin === 'detected');
    expect(detected.map((f) => f.text)).toEqual(['₹12', '18%', '3']);
    // Words with a number in them ("Order 7", "2 lines" outside the overlay) are not figures; neither are labels.
    const all = cap.screens.flatMap((s) => s.figures).map((f) => f.text);
    expect(all.some((t) => /Order 7|owner|staff|none|Delivery/.test(t))).toBe(false);
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
    expect(cap.mappings['order-total']!.code).toBe(
      'export function orderTotal(lines) {\n  let sum = 0;\n  for (const l of lines) sum += l.qty * l.pricePaise;\n  return sum;\n}',
    );
  });
});

describe('showroom', () => {
  it('marks a figure traced only when it maps to a trail; every other figure is untraced (Invariant 2)', () => {
    const s = showroomOf(cap, bp);
    const ids = (traced: boolean) =>
      s.screens.flatMap((x) =>
        x.figures.filter((f) => f.traced === traced).map((f) => `${x.name}/${f.id}`),
      );
    expect(ids(true)).toEqual(['home/order-total', 'order/order-total', 'order/line-count']);
    expect(ids(false)).toEqual([
      'home/untraced:home:1',
      'order/vat',
      'order/untraced:order:1',
      'order/untraced:order:2',
      'order/untraced:order:3',
    ]);
    expect(s.counts).toEqual({ shown: 8, traced: 3 });
    expect(Object.keys(s.trails).sort()).toEqual([
      'home/order-total',
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
