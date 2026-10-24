// What the screens say (Stage 7). Rule 15: no command is ever shown to a person. Invariant 11: "a test
// imports this file" is never shown as confidence. Both are read from the source of every page and
// component, and from the audit's findings, skipping import statements and comments.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(dir, e.name))
      : /\.(tsx?|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
  );

/** The lines that can reach a screen: not imports, not comments. */
function spoken(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let inBlock = false;
  readFileSync(path.join(root, file), 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const t = raw.trim();
      if (inBlock) {
        if (t.includes('*/')) inBlock = false;
        return;
      }
      if (t.startsWith('/*') || t.startsWith('{/*')) {
        if (!t.includes('*/')) inBlock = true;
        return;
      }
      if (t.startsWith('//') || t.startsWith('*') || /^(import|export) .* from '/.test(t)) return;
      if (/^import\s*\{?$/.test(t) || /^\} from '/.test(t)) return;
      out.push({ line: i + 1, text: t });
    });
  return out;
}

const UI = [
  ...files('apps/rama/app'),
  ...files('apps/rama/components'),
  ...files('apps/rama/canvas'),
];

describe('no command is shown to a person (rule 15)', () => {
  it('no page or component spells out a command to type', () => {
    const COMMAND = /\b(pnpm|npx|npm run|rama-trace|rama-audit|rama-ceremony|rama-pod|rama site)\b/;
    const found = UI.flatMap((f) =>
      spoken(f)
        .filter((l) => COMMAND.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text}`),
    );
    expect(found).toEqual([]);
  });
});

describe('"imports" is never a confidence word (Invariant 11)', () => {
  const CONFIDENCE =
    /\btests?\b[^.;]{0,40}\bimports?\b|\bimports?\b[^.;]{0,30}\btests?\b|test behind|no test found|tested\b/i;
  it('no page, component or audit finding presents a test importing a file as evidence', () => {
    const sources = [...UI, ...files('packages/audit/src'), ...files('packages/workbench/src')];
    const found = sources.flatMap((f) =>
      spoken(f)
        .filter(
          (l) => /['"`]/.test(l.text) || /^[^<]*>[^<]*</.test(l.text) || !/[;{}()=]/.test(l.text),
        )
        .filter((l) => CONFIDENCE.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text}`),
    );
    expect(found).toEqual([]);
  });

  it('the check itself catches the old wording', () => {
    for (const s of ["'a test imports it'", '"No test imports this brick."', '{cover.tested} of'])
      expect(CONFIDENCE.test(s), s).toBe(true);
  });
});
