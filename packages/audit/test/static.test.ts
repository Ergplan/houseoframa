// Each static check on a fixture that triggers it and one that does not (MASTER-PROMPT Stage 5 tests).
import { describe, expect, it } from 'vitest';
import { longUnauthRoute, staticChecks } from '../src/checks/static.ts';

const run = (src: string, formula = false, file = 'lib/x.ts') =>
  staticChecks(file, src, { formula });
const checks = (src: string, formula = false) =>
  run(src, formula).map((f) => [f.check, f.verdict, f.line]);

describe('silenced-lint', () => {
  it('finds eslint-disable, @ts-ignore, @ts-expect-error and @ts-nocheck in comments, with the line and reason', () => {
    const src =
      'const a = 1;\n// eslint-disable-next-line no-console -- startup log\nconsole.log(a);\n/* @ts-ignore */\nconst b: number = "x";\n// @ts-expect-error old api\n';
    const f = run(src).filter((x) => x.check === 'silenced-lint');
    expect(f.map((x) => x.line)).toEqual([2, 4, 6]);
    expect(f[0]!.text).toBe(
      'A check is silenced (eslint-disable-next-line: no-console -- startup log).',
    );
  });
  it('ignores the words outside a comment', () => {
    expect(checks("const s = 'eslint-disable';\nconst t = '@ts-ignore';\n")).toEqual([]);
  });
});

describe('swallowed-error', () => {
  it('finds an empty catch block and an empty .catch handler', () => {
    const src =
      'try { go(); } catch {}\np.catch(() => {});\nq.catch(() => null);\nr.catch(() => undefined);\n';
    expect(checks(src)).toEqual([
      ['swallowed-error', 'note', 1],
      ['swallowed-error', 'note', 2],
      ['swallowed-error', 'note', 3],
      ['swallowed-error', 'note', 4],
    ]);
  });
  it('leaves a handled error alone', () => {
    expect(checks('try { go(); } catch (e) { log(e); }\np.catch((e) => report(e));\n')).toEqual([]);
  });
});

describe('any-type', () => {
  it('finds `any` in a type and in a cast', () => {
    expect(checks('let a: any = 1;\nconst b = a as any;\n')).toEqual([
      ['any-type', 'note', 1],
      ['any-type', 'note', 2],
    ]);
  });
  it('leaves unknown and the word any alone', () => {
    expect(checks("let a: unknown = 1;\nconst any = 'any';\n")).toEqual([]);
  });
});

describe('magic-constant-in-formula', () => {
  const src =
    'export const TOLERANCE = 0.08;\nexport const gst = (x: number) => x * 0.18 + x * 100 - xs[3];\nenum E { A = 7 }\n';
  it('finds constants in a formula file, not indexes, enum values or 0, 1, 2, 10, 100, 1000', () => {
    expect(checks(src, true)).toEqual([
      ['magic-constant-in-formula', 'note', 1],
      ['magic-constant-in-formula', 'note', 2],
    ]);
  });
  it('says nothing about a file that holds no traced formula', () => {
    expect(checks(src, false)).toEqual([]);
  });
});

describe('browser-storage-write', () => {
  it('finds localStorage and sessionStorage writes, indexedDB.open and document.cookie', () => {
    const src =
      "localStorage.setItem('k', v);\nwindow.sessionStorage.setItem('k', v);\nlocalStorage['k'] = v;\nindexedDB.open('db');\ndocument.cookie = 'a=b';\n";
    expect(checks(src).map((c) => c[2])).toEqual([1, 2, 3, 4, 5]);
  });
  it('leaves reads alone', () => {
    expect(checks("const v = localStorage.getItem('k');\nconst c = document.cookie;\n")).toEqual(
      [],
    );
  });
});

describe('env-fallback', () => {
  it('finds one variable falling back to another, or to a literal', () => {
    const src =
      "const k = process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY1;\nconst p = process.env.PORT || '3000';\n";
    expect(checks(src)).toEqual([
      ['env-fallback', 'note', 1],
      ['env-fallback', 'note', 2],
    ]);
  });
  it('leaves a missing variable that is handled alone', () => {
    expect(
      checks(
        "const k = process.env.KEY;\nif (!k) throw new Error('KEY is not set');\nconst m = process.env.NAME?.trim() || null;\n",
      ),
    ).toEqual([]);
  });
});

describe('positional-assumption', () => {
  it('finds a fixed position taken from a sorted list, directly or through a name', () => {
    const src =
      'const byQuoted = [...bids].sort((a, b) => a - b);\nconst spread = byQuoted[2] - byQuoted[0];\nconst h1 = bids.toSorted()[1];\nconst last = byQuoted.at(-2);\n';
    expect(checks(src)).toEqual([
      ['positional-assumption', 'defect', 2],
      ['positional-assumption', 'defect', 3],
      ['positional-assumption', 'defect', 4],
    ]);
  });
  it('leaves an access alone when the length is tested first with a bound big enough', () => {
    const src = [
      'const close = [...xs].sort((a, b) => a - b);',
      'if (close.length > 1 && close[0] < close[1]) go();',
      'const two = close.length >= 2 ? close[1] : null;',
      'const three = 2 < close.length && close.at(2);',
      'function f() {',
      '  if (!close.length || close.length < 3) return;',
      '  return close[2];',
      '}',
      'function g() {',
      '  if (close.length <= 1) throw new Error("two needed");',
      '  return close[1];',
      '}',
      '',
    ].join('\n');
    expect(checks(src)).toEqual([]);
  });

  it('still flags an access whose length test is too small, does not exit, or guards the other branch', () => {
    const src = [
      'const s = [...xs].sort();',
      'if (s.length > 1) use(s[2]);',
      'function f() {',
      '  if (s.length) log();',
      '  return s[2];',
      '}',
      'function g() {',
      '  if (s.length < 3) log(); else use(s[2]);',
      '  return s[1];',
      '}',
      'const h = s.length || s[1];',
      '',
    ].join('\n');
    expect(checks(src).map((c) => c[2])).toEqual([2, 5, 8, 9, 11]);
  });

  it('leaves the first item, the last by length, and unsorted lists alone', () => {
    const src =
      'const s = [...xs].sort();\nconst lo = s[0];\nconst hi = s[s.length - 1];\nconst top = s.at(-1);\nconst third = row[2];\n';
    expect(checks(src)).toEqual([]);
  });
});

describe('long-unauth-route', () => {
  const route = 'app/api/llm/route.ts';
  it('finds a route that may run over 60 s, or streams, with no sign-in check', () => {
    expect(
      longUnauthRoute(
        route,
        'export const maxDuration = 300;\nexport async function POST() {}\n',
      )[0],
    ).toMatchObject({
      verdict: 'defect',
      text: 'A route that may run 300 s with no sign-in check in it.',
    });
    expect(
      longUnauthRoute(
        route,
        'export async function GET() { return new Response(new ReadableStream()); }\n',
      ),
    ).toHaveLength(1);
  });
  it('leaves a short route, a guarded route and a file that is not a route alone', () => {
    expect(longUnauthRoute(route, 'export const maxDuration = 30;\n')).toEqual([]);
    expect(
      longUnauthRoute(
        route,
        "import { getViewer } from '@/server/session';\nexport const maxDuration = 300;\n",
      ),
    ).toEqual([]);
    expect(longUnauthRoute('lib/stream.ts', 'export const maxDuration = 300;\n')).toEqual([]);
  });
});
