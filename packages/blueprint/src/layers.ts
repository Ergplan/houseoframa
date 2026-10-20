// Floors. A target may define its own in `.rama/layers.json`; otherwise the house-stack defaults of
// MASTER-PROMPT §7.2 apply. Every brick records the rule that placed it.
import type { Layer } from '@rama/shared';
import { matchGlob } from './glob.ts';

export interface LayerRule {
  layer: Layer;
  /** Names the rule in `BrickNode.layerRule`. */
  name: string;
  match: string[];
}

export interface LayersOverlay {
  /** Replaces the default floors when present (bottom to top). */
  layers?: { id: Layer; label: string }[];
  /** Tried in order before the defaults; first match wins. */
  rules?: { layer: Layer; match: string[]; name?: string }[];
  /** False drops the house-stack rules, leaving the overlay rules and the fallback. */
  defaults?: boolean;
}

export const DEFAULT_LAYERS: { id: Layer; label: string }[] = [
  { id: 'foundation', label: 'Foundation — manifests, config, deploy' },
  { id: 'data', label: 'Data — schema, migrations, datasets' },
  { id: 'logic', label: 'Logic — library code' },
  { id: 'api', label: 'API — server routes' },
  { id: 'interface', label: 'Interface — components' },
  { id: 'shell', label: 'Shell — routes, layout, styles, docs' },
];

/**
 * House-stack defaults (MASTER-PROMPT §7.2), matched at any depth so monorepo apps and `src/` trees
 * place the same way as a single app at the root. Order matters: the first match wins.
 */
export const DEFAULT_RULES: LayerRule[] = [
  {
    layer: 'foundation',
    name: 'package manifest',
    match: [
      '**/package.json',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
      '**/pnpm-workspace.yaml',
      '**/yarn.lock',
    ],
  },
  { layer: 'foundation', name: 'tsconfig', match: ['**/tsconfig*.json'] },
  { layer: 'foundation', name: 'next.config', match: ['**/next.config.*'] },
  { layer: 'foundation', name: 'vercel.json', match: ['**/vercel.json'] },
  { layer: 'foundation', name: '.env.example', match: ['**/.env.example'] },
  { layer: 'foundation', name: '.gitignore', match: ['**/.gitignore'] },
  {
    layer: 'foundation',
    name: 'proxy/middleware',
    match: ['**/proxy.{ts,js,mjs}', '**/middleware.{ts,js,mjs}'],
  },
  { layer: 'foundation', name: 'lib/server/**', match: ['**/lib/server/**'] },
  { layer: 'data', name: 'lib/data*, lib/history*', match: ['**/lib/data*', '**/lib/history*'] },
  {
    layer: 'data',
    name: 'schema and migrations',
    match: ['**/schema.{ts,js,sql,prisma}', '**/schema/**', '**/migrations/**', '**/drizzle/**'],
  },
  { layer: 'data', name: 'public/**', match: ['**/public/**'] },
  { layer: 'logic', name: 'lib/**', match: ['**/lib/**'] },
  { layer: 'api', name: 'app/api/**', match: ['**/app/api/**', '**/pages/api/**'] },
  { layer: 'interface', name: 'components/**', match: ['**/components/**'] },
  { layer: 'shell', name: 'app/**', match: ['**/app/**'] },
  { layer: 'shell', name: 'README', match: ['**/README*'] },
];

export const FALLBACK_LAYER: Layer = 'shell';

export interface LayerPlan {
  layers: { id: Layer; label: string }[];
  rules: LayerRule[];
}

export function planLayers(overlay: LayersOverlay | null): LayerPlan {
  const overlayRules: LayerRule[] = (overlay?.rules ?? []).map((r) => ({
    layer: r.layer,
    name: `overlay: ${r.name ?? r.match.join(', ')}`,
    match: r.match,
  }));
  const defaults =
    overlay?.defaults === false
      ? []
      : DEFAULT_RULES.map((r) => ({ ...r, name: `default: ${r.name}` }));
  const layers = overlay?.layers ?? DEFAULT_LAYERS;
  const plan = { layers, rules: [...overlayRules, ...defaults] };
  const known = new Set(layers.map((l) => l.id));
  for (const r of plan.rules) {
    if (!known.has(r.layer)) throw new Error(`layer rule "${r.name}" names unknown layer "${r.layer}"`);
  }
  if (!known.has(FALLBACK_LAYER)) throw new Error(`the layers must include "${FALLBACK_LAYER}" for unmatched files`);
  return plan;
}

/** The floor for a path and the rule that put it there. */
export function assignLayer(plan: LayerPlan, path: string): { layer: Layer; rule: string } {
  for (const rule of plan.rules) {
    if (rule.match.some((g) => matchGlob(g, path))) return { layer: rule.layer, rule: rule.name };
  }
  return { layer: FALLBACK_LAYER, rule: 'fallback: no rule matched' };
}
