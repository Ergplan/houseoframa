// The block splitter (Stage 11), on the house stack's own files and a few written for it: every line of a
// file in exactly one block, the blocks in order, each of the kinds the English pane speaks of.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { splitBlocks } from '../src/blocks.ts';

const STACK = path.resolve(import.meta.dirname, '../../../templates/house-stack');
const tsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (f === 'node_modules' || f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? tsFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

const covers = (source: string, blocks: ReturnType<typeof splitBlocks>) => {
  const total = source.replace(/\n$/, '').split('\n').length;
  let next = 1;
  for (const b of blocks) {
    expect(b.from).toBe(next);
    expect(b.to).toBeGreaterThanOrEqual(b.from);
    next = b.to + 1;
  }
  expect(next - 1).toBe(total);
};

describe('the block splitter', () => {
  it('puts every line of every house-stack file in exactly one block', () => {
    const files = tsFiles(STACK);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      covers(src, splitBlocks(path.relative(STACK, f), src));
    }
  });

  it('names each kind of block', () => {
    const src = [
      "import { pgTable, text } from 'drizzle-orm/pg-core';",
      "import { db } from '../db';",
      '',
      '// An order, as the stall keeps it.',
      'export interface Order {',
      '  cups: number;',
      '}',
      '',
      "export const orders = pgTable('orders', { item: text('item') });",
      '',
      'export const todays = db.select().from(orders);',
      '',
      '/** Cups times the price of a cup. */',
      'export function orderAmount(cups: number, price: number): number {',
      '  return cups * price;',
      '}',
      '',
      'export function NewOrder() {',
      '  return <p>New order</p>;',
      '}',
      '',
      "describe('the amount', () => {",
      "  it('multiplies', () => {});",
      '});',
      '// the end',
      '',
    ].join('\n');
    const blocks = splitBlocks('features/new/plan.tsx', src);
    expect(blocks.map((b) => [b.kind, b.name, b.from, b.to])).toEqual([
      ['imports', null, 1, 2],
      ['type', 'Order', 3, 7],
      ['table', 'orders', 8, 9],
      ['query', 'todays', 10, 11],
      ['function', 'orderAmount', 12, 16],
      ['component', 'NewOrder', 17, 20],
      ['test', 'the amount', 21, 25],
    ]);
    covers(src, blocks);
    // A route handler is a GET or POST of a route file.
    const route = splitBlocks(
      'app/api/orders/route.ts',
      'export async function GET() {\n  return Response.json([]);\n}\n',
    );
    expect(route.map((b) => b.kind)).toEqual(['route']);
  });

  it('keeps a block by its text: the same text is the same block, a change is a new one', () => {
    const a = splitBlocks('a.ts', 'export const x = 1;\nexport const y = 2;\n');
    const b = splitBlocks('b.ts', 'export const x = 1;\nexport const y = 3;\n');
    expect(a[0]!.hash).toBe(b[0]!.hash);
    expect(a[1]!.hash).not.toBe(b[1]!.hash);
    expect(splitBlocks('e.ts', '')).toEqual([]);
  });
});
