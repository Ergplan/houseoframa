import { describe, expect, it } from 'vitest';
import type { Blueprint } from '@rama/shared';
import { routeMatcher, screenForRoute } from './capture.ts';
import { ScreensConfig, FiguresOverlay } from './config.ts';
import { buildTrail, normalise } from './trail.ts';
import { codeAt } from './code.ts';

const bp = {
  screens: [
    { id: '/bills/[number]', name: 'Bill', route: '/bills/[number]', file: 'a', bricks: ['x'] },
    { id: '/bills/new', name: 'New bill', route: '/bills/new', file: 'b', bricks: ['y'] },
    { id: '/', name: 'Home', route: '/', file: 'c', bricks: ['z'] },
  ],
  commits: [
    {
      sha: 'c1',
      short: 'c1',
      at: '2026-01-01T00:00:00Z',
      author: 'Asha',
      subject: 'first',
      changes: [{ path: 'lib/tax.ts', kind: 'A', add: 1, del: 0 }],
    },
    {
      sha: 'c2',
      short: 'c2',
      at: '2026-01-02T00:00:00Z',
      author: 'Ravi',
      subject: 'docs',
      changes: [{ path: 'README.md', kind: 'M', add: 1, del: 0 }],
    },
    {
      sha: 'c3',
      short: 'c3',
      at: '2026-01-03T00:00:00Z',
      author: 'Asha',
      subject: 'rate',
      changes: [
        { path: 'lib/tax.ts', kind: 'M', add: 2, del: 1 },
        { path: 'lib/rules.json', kind: 'M', add: 1, del: 1 },
      ],
    },
  ],
} as unknown as Blueprint;

const mapping = {
  fn: 'computeTax',
  file: 'lib/tax.ts',
  line: 3,
  files: ['lib/rules.json'],
  title: 'GST',
  what: 'The tax on the bill.',
  english: 'Rate times taxable value, per line.',
  inputs: [
    { label: 'Lines', source: 'computeTax({lines})', data: 'documents.lines' },
    { label: 'Rate pack', source: 'rules' },
  ],
};

describe('routes', () => {
  it('matches dynamic segments and catch-alls, and prefers a literal route', () => {
    expect(routeMatcher('/bills/[number]').test('/bills/INV-042')).toBe(true);
    expect(routeMatcher('/bills/[number]').test('/bills/INV-042/remind')).toBe(false);
    expect(routeMatcher('/docs/[...slug]').test('/docs/a/b')).toBe(true);
    expect(screenForRoute(bp, '/bills/new')!.id).toBe('/bills/new');
    expect(screenForRoute(bp, '/bills/INV-042?as=owner')!.id).toBe('/bills/[number]');
    expect(screenForRoute(bp, '/')!.id).toBe('/');
    expect(screenForRoute(bp, '/nowhere')).toBeNull();
  });
});

describe('codeAt', () => {
  it('takes the function from its first line to where its braces balance', () => {
    const src =
      'import x;\n\nexport function f(a) {\n  if (a) {\n    return 1;\n  }\n  return 2;\n}\nconst after = 1;\n';
    expect(codeAt(src, 3)).toBe(
      'export function f(a) {\n  if (a) {\n    return 1;\n  }\n  return 2;\n}',
    );
    expect(codeAt('export const g = (a) => a * 2;\nnext', 1)).toBe(
      'export const g = (a) => a * 2;',
    );
  });
});

describe('codeAt, carefully', () => {
  it('ignores braces inside strings, template literals and comments', () => {
    const src = [
      'export function f(a) {',
      "  const s = '}';",
      '  const t = `${a}}`; // }',
      '  /* } */',
      '  return s + t;',
      '}',
      'const after = 1;',
    ].join('\n');
    expect(codeAt(src, 1, 'f.js')).toBe(src.split('\n').slice(0, 6).join('\n'));
  });

  it('says so when a long function is cut', () => {
    const body = Array.from({ length: 60 }, (_, i) => `  x += ${i};`);
    const src = ['export function long(x) {', ...body, '  return x;', '}'].join('\n');
    const code = codeAt(src, 1);
    expect(code.split('\n')).toHaveLength(41);
    expect(code.split('\n').at(-1)).toBe(
      '// … cut at 40 lines: the function continues in the file',
    );
  });
});

describe('codeAt, with a typed signature', () => {
  it("reads past object types in the parameters and the return type to the body's end", () => {
    const src = [
      'export async function loadGst(',
      '  viewer: Viewer,',
      '  opts: { period?: string | null; q?: string | null } = {},',
      '): Promise<{ total: number } | null> {',
      '  const q = { from: 1 };',
      '  return { total: q.from };',
      '}',
      'const after = 1;',
    ].join('\n');
    expect(codeAt(src, 1, 'data.ts')).toBe(src.split('\n').slice(0, 7).join('\n'));
  });
});

describe('buildTrail', () => {
  it('builds the five sections from the mapping, the screen and the re-execution', () => {
    const t = buildTrail(bp, {
      figureId: 'gst',
      mapping,
      code: 'function computeTax() {}',
      shown: '₹21,483',
      run: {
        ok: true,
        text: '₹21,483',
        value: 2148300,
        inputs: [{ label: 'Lines', value: '13 bills' }],
      },
    });
    expect(t).toEqual({
      figureId: 'gst',
      title: 'GST',
      what: 'The tax on the bill.',
      formula: {
        english: 'Rate times taxable value, per line.',
        code: 'function computeTax() {}',
        file: 'lib/tax.ts',
        line: 3,
      },
      inputs: [
        { label: 'Lines', value: '13 bills', source: 'computeTax({lines})' },
        { label: 'Rate pack', value: null, source: 'rules' },
      ],
      data: ['Lines: documents.lines', 'Rate pack: not recorded'],
      build: [
        {
          sha: 'c3',
          at: '2026-01-03T00:00:00Z',
          author: 'Asha',
          subject: 'rate',
          file: 'lib/tax.ts',
        },
        {
          sha: 'c3',
          at: '2026-01-03T00:00:00Z',
          author: 'Asha',
          subject: 'rate',
          file: 'lib/rules.json',
        },
        {
          sha: 'c1',
          at: '2026-01-01T00:00:00Z',
          author: 'Asha',
          subject: 'first',
          file: 'lib/tax.ts',
        },
      ],
      signoff: null,
      reexecuted: true,
      result: { shown: '₹21,483', computed: '₹21,483', matches: true },
    });
  });

  it('shows no values, says why, and does not claim a match when re-execution was impossible', () => {
    const t = buildTrail(bp, {
      figureId: 'gst',
      mapping,
      code: '',
      shown: '₹21,483',
      run: { ok: false, text: null, value: null, inputs: [], error: 'boom' },
    });
    expect(t.reexecuted).toBe(false);
    expect(t.inputs.every((i) => i.value === null)).toBe(true);
    expect(t.result).toEqual({ shown: '₹21,483', computed: null, matches: null });
    expect(t.reexecutionError).toBe('boom');
    expect(
      buildTrail(bp, { figureId: 'gst', mapping, code: '', shown: null, run: null })
        .reexecutionError,
    ).toMatch(/no way/);
  });

  it('reports a mismatch when the screen and the function disagree', () => {
    const t = buildTrail(bp, {
      figureId: 'gst',
      mapping,
      code: '',
      shown: '₹21,483',
      run: { ok: true, text: '₹21,484', value: 1, inputs: [] },
    });
    expect(t.result!.matches).toBe(false);
    expect(normalise('₹ 1,19,350 ')).toBe('₹1,19,350');
  });
});

describe('config', () => {
  it('fills defaults and refuses a screen without a route or with an unsafe name', () => {
    const c = ScreensConfig.parse({ app: {}, screens: [{ name: 'home', route: '/' }] });
    expect(c.app).toMatchObject({ install: 'npm ci', build: 'npm run build', ready: '/' });
    expect(c.viewport).toEqual({ width: 390, height: 844 });
    expect(
      ScreensConfig.safeParse({ app: {}, screens: [{ name: '../x', route: '/' }] }).success,
    ).toBe(false);
    expect(
      ScreensConfig.safeParse({ app: {}, screens: [{ name: 'x', route: 'gst' }] }).success,
    ).toBe(false);
    expect(ScreensConfig.safeParse({ app: {}, screens: [] }).success).toBe(false);
  });
  it('requires an overlay figure to say what it is, in English, and where it sits', () => {
    const ok = {
      fn: 'f',
      file: 'a.ts',
      line: 1,
      title: 'T',
      what: 'W',
      english: 'E',
      screen: 's',
      selector: '#a',
    };
    expect(FiguresOverlay.safeParse({ total: ok }).success).toBe(true);
    expect(FiguresOverlay.safeParse({ total: { ...ok, english: '' } }).success).toBe(false);
    expect(FiguresOverlay.safeParse({ total: { ...ok, selector: undefined } }).success).toBe(false);
  });
});
