import { describe, expect, it } from 'vitest';
import { matchGlob } from './glob.ts';

describe('matchGlob', () => {
  it('matches ** across segments, including none at the root', () => {
    expect(matchGlob('**/lib/**', 'lib/a.ts')).toBe(true);
    expect(matchGlob('**/lib/**', 'apps/web/lib/x/y.ts')).toBe(true);
    expect(matchGlob('**/lib/**', 'library/a.ts')).toBe(false);
  });
  it('keeps * and ? inside one segment', () => {
    expect(matchGlob('lib/data*', 'lib/data.ts')).toBe(true);
    expect(matchGlob('lib/data*', 'lib/data/x.ts')).toBe(false);
    expect(matchGlob('a?.ts', 'ab.ts')).toBe(true);
  });
  it('expands {a,b} alternatives and escapes dots', () => {
    expect(matchGlob('**/proxy.{ts,js}', 'proxy.js')).toBe(true);
    expect(matchGlob('**/proxy.{ts,js}', 'proxyxts')).toBe(false);
  });
});
