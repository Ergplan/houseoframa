import { describe, expect, it } from 'vitest';
import { assignLayer, DEFAULT_RULES, planLayers } from './layers.ts';

const defaults = planLayers(null);
const place = (p: string) => assignLayer(defaults, p);

describe('house-stack layer rules (MASTER-PROMPT §7.2)', () => {
  // One case per default rule, in rule order, plus the same rule one level down in a monorepo.
  const cases: [string, string, string][] = [
    ['package.json', 'foundation', 'default: package manifest'],
    ['package-lock.json', 'foundation', 'default: package manifest'],
    ['tsconfig.json', 'foundation', 'default: tsconfig'],
    ['next.config.mjs', 'foundation', 'default: next.config'],
    ['vercel.json', 'foundation', 'default: vercel.json'],
    ['.env.example', 'foundation', 'default: .env.example'],
    ['.gitignore', 'foundation', 'default: .gitignore'],
    ['proxy.ts', 'foundation', 'default: proxy/middleware'],
    ['middleware.ts', 'foundation', 'default: proxy/middleware'],
    ['lib/server/config.ts', 'foundation', 'default: lib/server/**'],
    ['lib/data.ts', 'data', 'default: lib/data*, lib/history*'],
    ['lib/history.ts', 'data', 'default: lib/data*, lib/history*'],
    ['db/schema.ts', 'data', 'default: schema and migrations'],
    ['db/migrations/0001.sql', 'data', 'default: schema and migrations'],
    ['public/logo.png', 'data', 'default: public/**'],
    ['lib/calc.ts', 'logic', 'default: lib/**'],
    ['app/api/llm/route.ts', 'api', 'default: app/api/**'],
    ['components/Studio.tsx', 'interface', 'default: components/**'],
    ['app/layout.tsx', 'shell', 'default: app/**'],
    ['app/page.tsx', 'shell', 'default: app/**'],
    ['app/globals.css', 'shell', 'default: app/**'],
    ['README.md', 'shell', 'default: README'],
  ];
  for (const [p, layer, rule] of cases) {
    it(`${p} → ${layer}`, () => {
      expect(place(p)).toEqual({ layer, rule });
      expect(place(`apps/web/${p}`).layer).toBe(layer);
    });
  }

  it('covers every default rule with a case', () => {
    const tested = new Set(cases.map(([, , r]) => r));
    for (const r of DEFAULT_RULES) expect(tested, r.name).toContain(`default: ${r.name}`);
  });

  it('puts lib/server before lib/data and lib/**: the first match wins', () => {
    expect(place('lib/server/data.ts').layer).toBe('foundation');
  });

  it('records the fallback when nothing matches', () => {
    expect(place('start.command')).toEqual({ layer: 'shell', rule: 'fallback: no rule matched' });
  });
});

describe('.rama/layers.json overlay', () => {
  it('tries overlay rules before the defaults and names them', () => {
    const plan = planLayers({ rules: [{ layer: 'logic', match: ['packages/*/src/**'], name: 'packages' }] });
    expect(assignLayer(plan, 'packages/db/src/x.ts')).toEqual({ layer: 'logic', rule: 'overlay: packages' });
    expect(assignLayer(plan, 'components/A.tsx').rule).toBe('default: components/**');
  });

  it('names an unnamed rule by its patterns', () => {
    const plan = planLayers({ rules: [{ layer: 'data', match: ['seed/**'] }] });
    expect(assignLayer(plan, 'seed/a.json').rule).toBe('overlay: seed/**');
  });

  it('can define its own floors and drop the defaults', () => {
    const plan = planLayers({
      layers: [
        { id: 'docs', label: 'Docs' },
        { id: 'shell', label: 'Shell' },
      ],
      rules: [{ layer: 'docs', match: ['**/*.md'] }],
      defaults: false,
    });
    expect(assignLayer(plan, 'README.md').layer).toBe('docs');
    expect(assignLayer(plan, 'package.json').rule).toBe('fallback: no rule matched');
  });

  it('refuses a rule for an unknown floor, and floors without the fallback', () => {
    expect(() => planLayers({ rules: [{ layer: 'attic', match: ['x'] }] })).toThrow(/unknown layer "attic"/);
    expect(() => planLayers({ layers: [{ id: 'only', label: 'Only' }] })).toThrow(/names unknown layer/);
    expect(() => planLayers({ layers: [{ id: 'only', label: 'Only' }], defaults: false })).toThrow(
      /must include "shell"/,
    );
  });
});
