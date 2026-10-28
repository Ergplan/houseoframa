// A file of the checkout as the code level reads it (Stage 11; reviewer run 13): only files inside the
// checkout, never one a link points to elsewhere.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileAt } from '../src/code.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'rama-code-'));
const repo = path.join(dir, 'repo');
mkdirSync(path.join(repo, 'lib'), { recursive: true });
writeFileSync(path.join(repo, 'lib/money.ts'), 'export const paise = 100;\n');
writeFileSync(path.join(dir, 'outside.txt'), 'not the product’s\n');
symlinkSync(path.join(dir, 'outside.txt'), path.join(repo, 'lib/leak.ts'));
symlinkSync(path.join(repo, 'lib/money.ts'), path.join(repo, 'lib/alias.ts'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('fileAt, in the checkout', () => {
  it('reads a file of the checkout, and a link to one inside it', () => {
    expect(fileAt(repo, 'lib/money.ts')).toBe('export const paise = 100;\n');
    expect(fileAt(repo, 'lib/alias.ts')).toBe('export const paise = 100;\n');
  });
  it('does not follow a link out of the checkout, nor read a folder or a missing file', () => {
    expect(fileAt(repo, 'lib/leak.ts')).toBeNull();
    expect(fileAt(repo, 'lib')).toBeNull();
    expect(fileAt(repo, 'lib/none.ts')).toBeNull();
  });
});
