import { describe, expect, it } from 'vitest';
import { isCode, parseSource } from './parse.ts';

const imports = (src: string, file = 'a.ts') => parseSource(file, src).imports;

describe('parseSource: imports', () => {
  it('records named imports by their exported name, not the local alias', () => {
    expect(imports(`import { a, b as c } from './x';`)).toEqual([{ spec: './x', symbols: ['a', 'b'], typeOnly: false }]);
  });
  it('records default and namespace imports', () => {
    expect(imports(`import D, * as NS from './x';`)[0]!.symbols).toEqual(['default', '*']);
  });
  it('records a side-effect import with no symbols', () => {
    expect(imports(`import './globals.css';`)).toEqual([{ spec: './globals.css', symbols: [], typeOnly: false }]);
  });
  it('marks `import type` and all-inline-type imports as type-only, and mixed ones as not', () => {
    expect(imports(`import type { T } from './t';`)[0]!.typeOnly).toBe(true);
    expect(imports(`import { type T, type U } from './t';`)[0]!.typeOnly).toBe(true);
    expect(imports(`import { type T, v } from './t';`)[0]!.typeOnly).toBe(false);
    expect(imports(`import D, { type T } from './t';`)[0]!.typeOnly).toBe(false);
  });
  it('treats re-exports as imports of the re-exported names', () => {
    expect(imports(`export { a as b } from './x'; export * from './y'; export type { T } from './t';`)).toEqual([
      { spec: './x', symbols: ['a'], typeOnly: false, reexport: true },
      { spec: './y', symbols: ['*'], typeOnly: false, reexport: true },
      { spec: './t', symbols: ['T'], typeOnly: true, reexport: true },
    ]);
  });
  it('finds dynamic import() and require()', () => {
    expect(imports(`const m = await import('./lazy'); const r = require('./old');`, 'a.js').map((i) => i.spec)).toEqual([
      './lazy',
      './old',
    ]);
  });
  it('ignores import-like text in strings and comments', () => {
    expect(imports(`// import { x } from './nope'\nconst s = "from './nope'";`)).toEqual([]);
  });
  it('parses JSX', () => {
    expect(imports(`import { A } from './A';\nexport const B = () => <A />;`, 'b.tsx')[0]!.spec).toBe('./A');
  });
});

describe('parseSource: exports', () => {
  it('lists declarations, specifiers, default and re-export-all', () => {
    const src = `export const a = 1, { b } = o; export function f() {} export class C {}
      export interface I {} export type T = 1; export enum E {} const z = 1; export { z as zed };
      export default function main() {} export * from './all'; export * as ns from './ns';`;
    expect(parseSource('m.ts', src).exports).toEqual(['*', 'C', 'E', 'I', 'T', 'a', 'b', 'default', 'f', 'ns', 'zed']);
  });
});

describe('parseSource: environment variables', () => {
  const env = (src: string) => {
    const f = parseSource('e.ts', src);
    return { env: f.env, dynamic: f.envDynamic };
  };
  it('reads process.env.X, process.env["X"] and import.meta.env.X', () => {
    expect(env(`process.env.A; process.env['B']; import.meta.env.C;`)).toEqual({ env: ['A', 'B', 'C'], dynamic: false });
  });
  it('resolves a const name and a for-of over a const array of names', () => {
    const src = `const K = 'ONE'; process.env[K];
      const NAMES = ['TWO', 'THREE'] as const; for (const n of NAMES) { process.env[n]; }`;
    expect(env(src)).toEqual({ env: ['ONE', 'THREE', 'TWO'], dynamic: false });
  });
  it('reads destructured names', () => {
    expect(env(`const { D, E: e } = process.env;`).env).toEqual(['D', 'E']);
  });
  it('marks a name it cannot resolve as dynamic instead of guessing', () => {
    expect(env(`function f(k: string) { return process.env[k]; }`)).toEqual({ env: [], dynamic: true });
  });
});

describe('isCode', () => {
  it('accepts JS/TS sources and rejects declarations and other files', () => {
    expect(['a.ts', 'a.tsx', 'a.mjs', 'a.cjs', 'a.jsx'].every(isCode)).toBe(true);
    expect(['a.d.ts', 'a.css', 'a.json', 'a.md'].some(isCode)).toBe(false);
  });
});

describe('parseSource: the columns of a table (Stage 11)', () => {
  const src = `import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { shared } from './elsewhere';
const provenance = () => ({
  siteId: text('site_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const sites = pgTable('sites', { siteId: text('site_id').primaryKey() });
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  ...provenance(),
  ...shared,
  site: text('site').references(() => sites.siteId),
  /** The card used. @secret */
  card: text('card_number').unique(),
  cups: integer().notNull(),
  odd: someColumn,
});`;
  const orders = () => parseSource('db/schema.ts', src).tables.find((t) => t.name === 'orders')!;

  it('reads each column’s name, type and keys as the definition writes them', () => {
    const f = orders().fields;
    expect(f.map((c) => [c.key, c.name, c.type])).toEqual([
      ['id', 'id', 'serial'],
      ['siteId', 'site_id', 'text'],
      ['createdAt', 'created_at', 'timestamp'],
      ['site', 'site', 'text'],
      ['card', 'card_number', 'text'],
      ['cups', 'cups', 'integer'],
      ['odd', 'odd', 'unknown'],
    ]);
    expect(f[0]).toMatchObject({ primary: true, notNull: true });
    expect(f[3]).toMatchObject({ references: 'sites.siteId', notNull: false });
    expect(f[4]).toMatchObject({ unique: true, secret: true });
    expect(f[5]).toMatchObject({ notNull: true, secret: false });
  });

  it('opens a spread written in the same file, and names the one it cannot', () => {
    expect(orders().fields.filter((c) => c.from).map((c) => [c.key, c.from])).toEqual([
      ['siteId', 'provenance'],
      ['createdAt', 'provenance'],
    ]);
    expect(orders().unread).toEqual(['shared']);
    // The keys written in the object itself are unchanged.
    expect(orders().columns).toEqual(['id', 'site', 'card', 'cups', 'odd']);
  });
});
