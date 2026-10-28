import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error -- plain .mjs script without type declarations
import { collectTypes, render } from '../../../scripts/gen-blueprint-doc.mjs';

type Collected = { name: string; kind: string; fields?: { name: string; doc: string }[] };

describe('shared types documentation', () => {
  it('documents every exported type and every field of MASTER-PROMPT §8 (and Table, Stage 8; TableField, Stage 11)', () => {
    const types = collectTypes() as Collected[];
    expect(types.map((t) => t.name)).toEqual([
      'Layer',
      'BrickNode',
      'ImportEdge',
      'Commit',
      'Table',
      'TableField',
      'Screen',
      'FigureRef',
      'Blueprint',
      'Trail',
      'Decision',
      'Signoff',
      'Finding',
    ]);
    for (const t of types)
      for (const f of t.fields ?? []) expect(f.doc, `${t.name}.${f.name}`).toBeTruthy();
  });

  it('refuses a field without a doc comment', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rama-doc-'));
    const file = path.join(dir, 'bad.ts');
    writeFileSync(file, '/** Documented. */\nexport interface Bad {\n  undocumented: string;\n}\n');
    expect(() => collectTypes([file])).toThrow(/Bad\.undocumented/);
  });

  it('escapes union pipes inside table cells', () => {
    const doc = render() as string;
    expect(doc).toContain("'A' \\| 'M' \\| 'D' \\| 'R'");
  });
});
