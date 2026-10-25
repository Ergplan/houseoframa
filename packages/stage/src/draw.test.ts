import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { building } from './building.ts';
import { drawBuilding, drawStreet, type Flag } from './draw.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { paletteFromTokens, STAGE_TOKENS } from './palette.ts';
import { streetTimeline } from './replay.ts';
import { street } from './street.ts';

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), {
  shots: { '/': 'orders.png' },
});
const flags: Record<string, Flag> = {
  'see-orders': { state: 'Verified', by: [] },
  'take-an-order': { state: 'Unverified', by: [] },
  'count-takings': { state: 'Confirmed', by: ['Asha'] },
};
const image = () => ({}) as CanvasImageSource;

describe('the lakefront is drawn with Harmony’s tokens only', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`uses no colour outside the ${theme} theme's tokens`, () => {
      const pal = paletteFromTokens(tokens, theme);
      const allowed = new Set([...Object.values(pal.color), 'transparent']);
      const { ctx, rec } = recorder();
      const tl = streetTimeline(bp, s);
      drawStreet(ctx, {
        street: s,
        palette: pal,
        flags,
        selected: 'take-an-order',
        hover: 'see-orders',
        image,
        replay: { timeline: tl, k: 2, p: 0.4 },
        hour: 2,
        audit: {
          badges: { 'see-orders': 'defect' },
          drones: [{ x: 10, y: 10 }],
          scan: { building: 'see-orders', drone: 0 },
        },
      });
      const nodeOf = (p: string) => bp.nodes.find((n) => n.path === p)!;
      const sc = building(s.buildings[0]!, [], nodeOf, new Set());
      drawBuilding(ctx, {
        scene: sc,
        palette: pal,
        flag: flags['see-orders']!,
        picked: null,
        hover: null,
        verdicts: { 'db/orders.ts': 'note' },
      });
      expect(rec.colors.length).toBeGreaterThan(20);
      expect(rec.colors.filter((c) => !allowed.has(c))).toEqual([]);
    });
  }

  it('names every token it uses in tokens.json', () => {
    const names = new Set(tokens.color.tokens.map((t) => t.name));
    expect(STAGE_TOKENS.filter((t) => !names.has(t))).toEqual([]);
  });
});

describe('drawStreet', () => {
  const pal = paletteFromTokens(tokens, 'dark');

  it('writes every building’s name and its flag as a word, with the names of those who signed', () => {
    const { ctx, rec } = recorder();
    drawStreet(ctx, { street: s, palette: pal, flags, selected: null, hover: null });
    expect(rec.texts).toEqual(
      expect.arrayContaining([
        'See today’s orders',
        'Take an order',
        'Count the takings',
        'Verified',
        'Unverified',
        'Confirmed by Asha',
        'orders',
        'OpenAI',
      ]),
    );
  });

  it('paints only the selected building as the folder: one green object', () => {
    const { ctx, rec } = recorder();
    drawStreet(ctx, { street: s, palette: pal, flags, selected: 'take-an-order', hover: null });
    expect(rec.fills.filter((c) => c === pal.color.folder)).toHaveLength(1);
    const none = recorder();
    drawStreet(none.ctx, { street: s, palette: pal, flags, selected: null, hover: null });
    expect(none.rec.fills.filter((c) => c === pal.color.folder)).toHaveLength(0);
  });

  it('puts the photographed screen on its facade, and draws the rest without one', () => {
    const { ctx, rec } = recorder();
    drawStreet(ctx, { street: s, palette: pal, flags, selected: null, hover: null, image });
    expect(rec.images).toBe(1);
  });

  it('draws the sun by day and the moon by night during the replay', () => {
    const at = (hour: number) => {
      const { ctx, rec } = recorder();
      drawStreet(ctx, { street: s, palette: pal, flags, selected: null, hover: null, hour });
      return rec.fills;
    };
    expect(at(13)).toContain(pal.color['series-grid']);
    expect(at(2)).not.toContain(pal.color['series-grid']);
  });

  it('draws nothing of a building before its first lift', () => {
    const { ctx, rec } = recorder();
    drawStreet(ctx, {
      street: s,
      palette: pal,
      flags,
      selected: null,
      hover: null,
      replay: { timeline: streetTimeline(bp, s), k: 0, p: 0 },
    });
    expect(rec.texts).not.toContain('Take an order');
    // Nor the table's plot before the file that defines it, nor a jetty before a building that uses it.
    expect(rec.texts).not.toContain('orders');
    expect(rec.texts).not.toContain('OpenAI');
  });
});
