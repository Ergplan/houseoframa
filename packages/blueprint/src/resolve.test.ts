import { describe, expect, it } from 'vitest';
import { Resolver } from './resolve.ts';

function resolver(files: Record<string, string>) {
  return new Resolver({ files: new Set(Object.keys(files)), read: (p) => files[p] ?? null });
}

describe('Resolver', () => {
  const r = resolver({
    'app/page.tsx': '',
    'app/globals.css': '',
    'lib/calc.ts': '',
    'lib/ui/index.tsx': '',
    'lib/esm.ts': '',
    'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }',
  });

  it('resolves relative paths with extension candidates', () => {
    expect(r.resolve('app/page.tsx', '../lib/calc')).toEqual({ kind: 'internal', path: 'lib/calc.ts' });
    expect(r.resolve('app/page.tsx', './globals.css')).toEqual({ kind: 'internal', path: 'app/globals.css' });
  });
  it('resolves a directory to its index file', () => {
    expect(r.resolve('app/page.tsx', '../lib/ui')).toEqual({ kind: 'internal', path: 'lib/ui/index.tsx' });
  });
  it('maps a .js specifier to the .ts source (TypeScript ESM style)', () => {
    expect(r.resolve('app/page.tsx', '../lib/esm.js')).toEqual({ kind: 'internal', path: 'lib/esm.ts' });
  });
  it('resolves a tsconfig paths alias', () => {
    expect(r.resolve('app/page.tsx', '@/lib/calc')).toEqual({ kind: 'internal', path: 'lib/calc.ts' });
  });
  it('reports an alias or relative import that matches no file as unresolved, and a package as external', () => {
    expect(r.resolve('app/page.tsx', '@/lib/missing')).toEqual({ kind: 'unresolved' });
    expect(r.resolve('app/page.tsx', './missing')).toEqual({ kind: 'unresolved' });
    expect(r.resolve('app/page.tsx', 'react')).toEqual({ kind: 'external' });
  });
  it('never resolves outside the repository', () => {
    expect(r.resolve('app/page.tsx', '../../etc/passwd')).toEqual({ kind: 'unresolved' });
  });

  it('uses the nearest tsconfig, follows relative extends, and prefers the most specific pattern', () => {
    const m = resolver({
      'tsconfig.base.json': `{ // comments are allowed
        "compilerOptions": { "paths": { "@ek/engine": ["./packages/engine/src/index.ts"], "@ek/*": ["./packages/*"] } } }`,
      'apps/web/tsconfig.json': '{ "extends": "../../tsconfig.base.json" }',
      'apps/web/app/page.tsx': '',
      'packages/engine/src/index.ts': '',
      'packages/ui/index.ts': '',
    });
    expect(m.resolve('apps/web/app/page.tsx', '@ek/engine')).toEqual({ kind: 'internal', path: 'packages/engine/src/index.ts' });
    expect(m.resolve('apps/web/app/page.tsx', '@ek/ui')).toEqual({ kind: 'internal', path: 'packages/ui/index.ts' });
  });

  it('resolves workspace packages by name through package.json exports', () => {
    const w = resolver({
      'packages/db/package.json': '{ "name": "@x/db", "exports": { ".": "./src/index.ts", "./schema": "./src/schema.ts" } }',
      'packages/db/src/index.ts': '',
      'packages/db/src/schema.ts': '',
      'packages/model/src/call.ts': '',
    });
    expect(w.resolve('packages/model/src/call.ts', '@x/db')).toEqual({ kind: 'internal', path: 'packages/db/src/index.ts' });
    expect(w.resolve('packages/model/src/call.ts', '@x/db/schema')).toEqual({
      kind: 'internal',
      path: 'packages/db/src/schema.ts',
    });
    expect(w.resolve('packages/model/src/call.ts', '@x/db/nothing')).toEqual({ kind: 'unresolved' });
  });
});
