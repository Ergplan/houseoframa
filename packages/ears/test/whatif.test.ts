// "What if" by voice (Stage 10): the figure's own function run again in the sandbox with one input
// changed, and written the way the product writes it on its screen; nothing saved. A product of two
// files stands in for a built one: its figure function and the house stack's rama/define.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SiteLocation } from '@rama/blueprint/site';
import { whatIf } from '../src/room.ts';
import { TAKINGS } from './fixtures.ts';

let work: string;
let site: SiteLocation;
let env: NodeJS.ProcessEnv;
const DEFINE = path.resolve(import.meta.dirname, '../../../templates/house-stack/rama/define.ts');

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-whatif-'));
  const repo = path.join(work, 'chai/repo');
  mkdirSync(path.join(repo, 'rama'), { recursive: true });
  mkdirSync(path.join(repo, 'features/new'), { recursive: true });
  writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(repo, 'rama/define.ts'), readFileSync(DEFINE, 'utf8'));
  writeFileSync(
    path.join(repo, 'features/new/plan.ts'),
    'export function newOrderAmount(cups: number, pricePaise: number): number {\n  return cups * pricePaise;\n}\n',
  );
  writeFileSync(
    path.join(work, 'chai/capture.json'),
    JSON.stringify({
      version: 1,
      site: 'chai',
      commit: 'c1',
      capturedAt: '2026-10-27T10:00:00Z',
      viewport: { width: 1280, height: 800 },
      screens: [
        {
          name: 'new',
          title: 'New order',
          route: '/new',
          role: 'customer',
          shot: 'new.png',
          width: 1280,
          height: 800,
          blueprintScreen: '/new',
          bricks: [],
          figures: [
            {
              id: 'new-order-amount',
              origin: 'attribute',
              text: '₹30.00',
              box: { x: 0, y: 0, w: 1, h: 1 },
              args: [2, 1500],
            },
            {
              id: 'orders-so-far',
              origin: 'attribute',
              text: '4',
              box: { x: 0, y: 0, w: 1, h: 1 },
              args: [[1, 2]],
            },
          ],
        },
      ],
      mappings: {
        'new-order-amount': {
          origin: 'convention',
          file: 'features/new/plan.ts',
          fn: 'newOrderAmount',
          line: 1,
          title: 'New order amount',
          inputs: [
            { label: 'cups', source: 'newOrderAmount(cups)', data: 'the form' },
            { label: 'price of a cup', source: 'newOrderAmount(…, pricePaise)', data: 'the menu' },
          ],
          files: [],
          show: 'rupees',
          code: '',
        },
        'orders-so-far': {
          origin: 'convention',
          file: 'features/new/plan.ts',
          fn: 'newOrderAmount',
          line: 1,
          title: 'Orders so far',
          inputs: [{ label: 'the day’s orders', source: 'x', data: 'data/orders.json' }],
          files: [],
          code: '',
        },
      },
      runs: {},
    }),
  );
  env = { ...process.env, RAMA_WORK_DIR: work };
  site = {
    id: 'chai',
    name: 'Chai',
    kind: 'product',
    repoDir: repo,
    blueprintPath: '',
    options: {},
  } as SiteLocation;
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const amount = {
  key: 'new/new-order-amount',
  name: 'New order amount',
  screen: 'New order',
  trail: TAKINGS,
};

describe('what if, by voice', () => {
  it('works the figure out again with one input changed, written as its screen writes it', async () => {
    expect(await whatIf(site, amount, 'cups', 3, env)).toBe(
      'If cups were 3, “New order amount” would be ₹45.00, worked out by the product’s own code. Nothing is saved; the screen still shows ₹30.00.',
    );
    expect(await whatIf(site, amount, 'price', 2000, env)).toMatch(
      /^If price of a cup were 2000, “New order amount” would be ₹40\.00/,
    );
  }, 60_000);

  it('says so when the input is not there, is a list, or the figure is untraced', async () => {
    expect(await whatIf(site, amount, 'sugar', 1, env)).toBe(
      '“New order amount” has no input called “sugar”. Its inputs are cups, price of a cup.',
    );
    expect(
      await whatIf(
        site,
        { key: 'new/orders-so-far', name: 'Orders so far', screen: 'New order', trail: TAKINGS },
        'orders',
        3,
        env,
      ),
    ).toBe(
      "“Orders so far”'s input “the day’s orders” is not a single number, so it cannot be changed by voice.",
    );
    expect(await whatIf(site, { ...amount, trail: null }, 'cups', 3, env)).toMatch(
      /is untraced, or its screen gives no inputs/,
    );
  });
});
