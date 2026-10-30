// The film's picture (Stage 13): drawn with Harmony's tokens only, the same every time for the same frame,
// bricks placed on their floors inside their buildings, a design drawn before anything is laid, and the
// picture answering what lies under a point.
import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { paletteFromTokens } from './palette.ts';
import { at, street } from './street.ts';
import { orientStreet } from './camera.ts';
import {
  drawFilm,
  drawFoundation,
  pickFilm,
  pipeFromTable,
  placeBricks,
  type FilmFrame,
} from './film.ts';
import { boxFaces } from './iso.ts';

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)));
const all = new Set(s.buildings.flatMap((b) => b.bricks));

const frame = (over: Partial<FilmFrame> = {}, theme: 'dark' | 'light' = 'dark'): FilmFrame => ({
  street: s,
  palette: paletteFromTokens(tokens, theme),
  laid: all,
  live: s.buildings[0]!.bricks[0] ?? null,
  plots: Object.fromEntries(s.plots.map((p) => [p.table, { lit: true, rows: 4 }])),
  flags: { [s.buildings[0]!.id]: { word: 'Verified', good: true } },
  agent: { building: s.buildings[0]!.id, name: 'The Builder', vendor: 'Claude Code' },
  pipes: [
    {
      points: pipeFromTable(
        s,
        s.plots[0]!.table,
        s.plots[0]!.writtenBy[0] ?? s.buildings[0]!.id,
        'decides',
        true,
      )!,
      t: 0.5,
      label: '4 rows',
      kind: 'flow',
    },
  ],
  highlight: { building: s.buildings[0]!.id, table: s.plots[0]!.table, floor: 'decides' },
  time: 2,
  floorNames: true,
  ...over,
});

describe('the film is drawn with Harmony’s tokens only', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`uses no colour outside the ${theme} theme's tokens`, () => {
      const pal = paletteFromTokens(tokens, theme);
      const allowed = new Set([...Object.values(pal.color), 'transparent']);
      const { ctx, rec } = recorder();
      drawFilm(ctx, frame({}, theme));
      const used = new Set([...rec.colors, ...rec.fills]);
      expect([...used].filter((c) => !allowed.has(c))).toEqual([]);
    });
  }
  it('draws the foundation with the tokens only too', () => {
    const pal = paletteFromTokens(tokens, 'dark');
    const allowed = new Set([...Object.values(pal.color), 'transparent']);
    const { ctx, rec } = recorder();
    drawFoundation(ctx, {
      palette: pal,
      width: 1000,
      height: 700,
      blocks: [
        { name: 'The pipe to the ground', layer: 'remembers' },
        { name: 'The register of numbers', layer: 'decides' },
        { name: 'The front door', layer: 'shows' },
        { name: 'The merge gate', layer: 'checks' },
      ],
      laid: 3,
      rise: 0.4,
      orientation: 1,
      scale: 1,
    });
    expect([...new Set([...rec.colors, ...rec.fills])].filter((c) => !allowed.has(c))).toEqual([]);
    expect(rec.texts).toEqual(
      expect.arrayContaining([
        'Remembers',
        'Decides',
        'Shows',
        'The merge gate',
        'the ground · the database',
      ]),
    );
  });
});

describe('a frame', () => {
  it('draws the same picture every time', () => {
    const a = recorder();
    const b = recorder();
    drawFilm(a.ctx, frame());
    drawFilm(b.ctx, frame());
    expect(a.rec).toEqual(b.rec);
  });

  it('names every building, its state, the tables and their rows, and who is at work', () => {
    const { ctx, rec } = recorder();
    drawFilm(ctx, frame());
    for (const b of s.buildings) expect(rec.texts).toContain(b.name);
    for (const p of s.plots) expect(rec.texts).toContain(p.table);
    expect(rec.texts).toContain('4 rows');
    expect(rec.texts).toContain('▶ Verified');
    expect(rec.texts).toContain('The Builder');
    expect(rec.texts).toContain('Claude Code');
  });

  it('draws a design before anything is laid: every building says it is not built yet', () => {
    const { ctx, rec } = recorder();
    drawFilm(
      ctx,
      frame({ laid: new Set(), live: null, flags: {}, agent: null, pipes: [], plots: {} }),
    );
    expect(rec.texts.filter((t) => t === '▶ Not built yet')).toHaveLength(s.buildings.length);
    expect(rec.texts).toContain('empty');
  });

  it('counts the parts laid so far in a building being built', () => {
    const b = s.buildings.find((x) => x.bricks.length > 1)!;
    const { ctx, rec } = recorder();
    drawFilm(ctx, frame({ laid: new Set([b.bricks[0]!]), flags: {}, plots: {} }));
    expect(rec.texts).toContain(`▶ 1 of ${placeBricks(b).length} parts`);
  });
});

describe('bricks inside the glass', () => {
  it('stand inside their building, on their floor, one place each', () => {
    for (const b of s.buildings) {
      const placed = placeBricks(b);
      expect(placed.map((x) => x.path).sort()).toEqual(
        b.floors.flatMap((f) => f.bricks.map((x) => x.path)).sort(),
      );
      for (const k of placed) {
        expect(k.gx).toBeGreaterThanOrEqual(b.gx);
        expect(k.gy).toBeGreaterThanOrEqual(b.gy);
        expect(k.gx + k.s).toBeLessThanOrEqual(b.gx + b.side);
        expect(k.gy + k.s).toBeLessThanOrEqual(b.gy + b.side);
        const f = b.floors.find((x) => x.kind === k.floor)!;
        expect(k.z0).toBeGreaterThanOrEqual(f.z0);
        expect(k.z0 + k.h).toBeLessThanOrEqual(f.z1 + 1);
      }
      const spots = new Set(placed.map((k) => `${k.floor}:${k.gx}:${k.gy}`));
      expect(spots.size).toBe(placed.length);
    }
  });
});

describe('what lies under a point', () => {
  for (const o of ['north', 'east', 'south', 'west'] as const) {
    it(`finds each building and each table seen from the ${o}`, () => {
      const t = orientStreet(s, o);
      const a = at(t);
      for (const b of t.buildings) {
        const f = boxFaces(b.gx, b.gy, b.side, b.side, b.height, a);
        const mid = {
          x: f.top.reduce((x, p) => x + p.x, 0) / 4,
          y: f.top.reduce((y, p) => y + p.y, 0) / 4,
        };
        expect(pickFilm(t, mid)).toEqual({ building: b.id });
      }
      for (const p of t.plots) {
        const mid = a(p.gx + p.w / 2, p.gy + p.d / 2);
        const got = pickFilm(t, mid);
        // A plot hidden behind a building is that building's; one in the open is its own.
        if (got && 'table' in got) expect(got).toEqual({ table: p.table });
      }
      expect(pickFilm(t, { x: -5000, y: -5000 })).toBeNull();
    });
  }
});

describe('a pipe from a table', () => {
  it('runs from the plot up into the building, and on to its screen when asked', () => {
    const p = s.plots[0]!;
    const b = s.buildings[0]!;
    const up = pipeFromTable(s, p.table, b.id, 'decides', false)!;
    const screen = pipeFromTable(s, p.table, b.id, 'decides', true)!;
    expect(up[0]).toEqual({ gx: p.gx + p.w / 2, gy: p.gy + p.d / 2, z: -2 });
    expect(screen.length).toBe(up.length + 2);
    expect(pipeFromTable(s, 'no-such-table', b.id, 'decides', true)).toBeNull();
  });
});
