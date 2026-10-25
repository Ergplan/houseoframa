// The lakefront is drawn with Harmony's tokens and nothing else (design/harmony/README.md). A Palette is
// the tokens' values in the theme being shown: read from the page's CSS custom properties in the browser
// (so it follows a theme change), or from design/harmony/tokens.json in a test.

/** The tokens the lakefront uses, by their names in tokens.json. */
export const STAGE_TOKENS = [
  'canvas',
  'surface',
  'surface-2',
  'glass',
  'glass-strong',
  'line',
  'line-strong',
  'ink',
  'ink-muted',
  'ink-faint',
  'accent',
  'accent-soft',
  'on-accent',
  'harmony',
  'glow',
  'folder',
  'folder-hi',
  'folder-deep',
  'on-folder',
  'positive',
  'negative',
  'warning',
  'negative-soft',
  'warning-soft',
  'series-grid',
  'focus-ring',
] as const;
export type StageToken = (typeof STAGE_TOKENS)[number];

export interface Palette {
  color: Record<StageToken, string>;
  /** Font families: Urbanist for everything a person reads, JetBrains Mono only at the code level. */
  sans: string;
}

/** A palette from a lookup of token values (`getComputedStyle(...).getPropertyValue('--' + name)`). */
export function paletteFrom(get: (token: string) => string, sans: string): Palette {
  const color = {} as Record<StageToken, string>;
  for (const t of STAGE_TOKENS) color[t] = get(t).trim();
  return { color, sans };
}

interface TokensJson {
  color: { tokens: { name: string; value: Record<string, string> }[] };
  type: { families: Record<string, string> };
}

/** A palette straight from tokens.json, for one theme. */
export function paletteFromTokens(tokens: TokensJson, theme: 'dark' | 'light'): Palette {
  const byName = new Map(tokens.color.tokens.map((t) => [t.name, t.value[theme]!]));
  return paletteFrom((t) => {
    const v = byName.get(t);
    if (!v) throw new Error(`Harmony has no token ${t}`);
    return v;
  }, tokens.type.families.sans!);
}
