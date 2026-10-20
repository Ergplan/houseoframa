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
      { spec: './x', symbols: ['a'], typeOnly: false },
      { spec: './y', symbols: ['*'], typeOnly: false },
      { spec: './t', symbols: ['T'], typeOnly: true },
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
