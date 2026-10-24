// Generates apps/rama/app/harmony-tokens.css from design/harmony/tokens.json (rule 17: the tokens are the
// only source of colour, type, spacing and radius). Both themes: dark on :root and [data-theme="dark"],
// light on [data-theme="light"]. The file is generated; never edit it by hand.
// Usage: node scripts/gen-harmony-css.mjs          writes the file
//        node scripts/gen-harmony-css.mjs --check  exits 1 when the file on disk differs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = path.join(root, 'design/harmony/tokens.json');
export const CSS_PATH = path.join(root, 'apps/rama/app/harmony-tokens.css');

export function harmonyCss(tokens) {
  const themed = (theme) => [
    ...tokens.color.tokens.map((t) => `  --${t.name}: ${t.value[theme]};`),
    ...tokens.shadow.tokens.map(
      (t) => `  --${t.name}: ${typeof t.value === 'string' ? t.value : t.value[theme]};`,
    ),
  ];
  const fixed = [
    ...Object.entries(tokens.type.families).map(([k, v]) => `  --font-${k}: ${v};`),
    ...tokens.spacing.tokens.map((t) => `  --${t.name}: ${t.value};`),
    ...tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`),
    ...tokens.blur.tokens.map((t) => `  --${t.name}: ${t.value};`),
  ];
  const styles = tokens.type.groups.flatMap((g) =>
    g.styles.map(
      (s) =>
        `.eg-type-${s.name} {\n  font-family: var(--font-${g.family});\n  font-size: ${s.fontSize};\n  line-height: ${s.lineHeight};\n  font-weight: ${s.fontWeight};${
          s.letterSpacing ? `\n  letter-spacing: ${s.letterSpacing};` : ''
        }\n}`,
    ),
  );
  return [
    `/* Generated from design/harmony/tokens.json (${tokens.name} v${tokens.version}, ${tokens.meta.repo} ${tokens.meta.ref}) by scripts/gen-harmony-css.mjs. Do not edit. */`,
    `:root,\n[data-theme='dark'] {\n  color-scheme: dark;\n${[...themed('dark'), ...fixed].join('\n')}\n}`,
    `[data-theme='light'] {\n  color-scheme: light;\n${themed('light').join('\n')}\n}`,
    ...styles,
    '',
  ].join('\n\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const css = harmonyCss(JSON.parse(readFileSync(TOKENS, 'utf8')));
  if (process.argv.includes('--check')) {
    const now = existsSync(CSS_PATH) ? readFileSync(CSS_PATH, 'utf8') : '';
    if (now !== css) {
      console.error(
        `${CSS_PATH} differs from design/harmony/tokens.json: run \`pnpm gen:harmony\``,
      );
      process.exit(1);
    }
    console.log(`${CSS_PATH} is up to date`);
  } else {
    writeFileSync(CSS_PATH, css);
    console.log(`wrote ${CSS_PATH}`);
  }
}
