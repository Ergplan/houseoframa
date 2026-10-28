import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { ORIENTATIONS } from './camera.ts';
import { drawGround } from './draw.ts';
import { cellPoint, G_HEADER, G_ROW, ground, pickGround, type GroundInput } from './ground.ts';
import { paletteFromTokens } from './palette.ts';

const input = (rows = 4): GroundInput => ({
  table: 'orders',
  columns: [
    { name: 'id', type: 'serial', key: 'primary', figure: false, masked: false },
    { name: 'created_at', type: 'timestamp', key: null, figure: false, masked: false },
    { name: 'item', type: 'text', key: null, figure: false, masked: false },
    { name: 'cups', type: 'integer', key: null, figure: true, masked: false },
    { name: 'api_key', type: 'text', key: null, figure: false, masked: true },
  ],
  rows: Array.from({ length: rows }, (_, i) => [
    String(rows - i),
    `2026-10-28 09:0${i}:00+05:30`,
    i % 2 ? 'Ginger chai' : 'Masala chai',
    String((i % 3) + 1),
    i % 2 ? '••••' : null,
  ]),
  readBy: ['See today’s orders', 'Count the day’s takings'],
  writtenBy: ['Take an order'],
  note: null,
});

describe('the ground opened: a table as a glass slab', () => {
  it('is deterministic, and as tall as its rows, never less than three', () => {
    expect(JSON.stringify(ground(input()))).toBe(JSON.stringify(ground(input())));
    const s = ground(input(50));
    expect(s.h).toBe(G_HEADER + 50 * G_ROW + 14);
    expect(ground(input(0)).h).toBe(G_HEADER + 3 * G_ROW + 14);
    // Every column fits across the face.
    const last = s.cols.at(-1)!;
    expect(last.x + last.w).toBeLessThanOrEqual(s.faceLen);
  });

  it('turns in quarter steps: the table on the face toward the camera, never mirrored', () => {
    const faces = ORIENTATIONS.map((o) => ground(input(), o));
    expect(faces.map((s) => s.tableFace)).toEqual(['left', 'right', 'left', 'right']);
    // From an odd side the slab's sides swap.
    expect([faces[1]!.w, faces[1]!.d]).toEqual([faces[0]!.d, faces[0]!.w]);
    for (const s of faces) {
      // Across the table runs left to right in the picture, and down runs down.
      const head = cellPoint(s, -1, 0);
      const next = cellPoint(s, -1, 1);
      const below = cellPoint(s, 0, 0);
      expect(next.x).toBeGreaterThan(head.x);
      expect(below.y).toBeGreaterThan(head.y);
    }
  });

  it('picks every cell and every column’s head back from where it is drawn, from all four sides', () => {
    for (const o of ORIENTATIONS) {
      const s = ground(input(), o);
      for (let col = 0; col < s.cols.length; col++) {
        expect(pickGround(s, cellPoint(s, -1, col)), `${o} head ${col}`).toEqual({
          kind: 'column',
          col,
        });
        for (let row = 0; row < s.rows; row++)
          expect(pickGround(s, cellPoint(s, row, col)), `${o} ${row},${col}`).toEqual({
            kind: 'cell',
            row,
            col,
          });
      }
      expect(pickGround(s, { x: 0, y: 0 })).toBeNull();
    }
  });

  it('runs a pipe up to every building that writes it and every one that reads it, each pickable', () => {
    const s = ground(input());
    expect(s.pipes.map((p) => [p.kind, p.building])).toEqual([
      ['writes', 'Take an order'],
      ['reads', 'See today’s orders'],
      ['reads', 'Count the day’s takings'],
    ]);
    for (const p of s.pipes) {
      expect(p.to.y).toBeLessThan(p.from.y);
      expect(pickGround(s, { x: p.to.x, y: (p.to.y + p.from.y) / 2 })).toEqual({
        kind: 'pipe',
        building: p.building,
      });
    }
  });

  for (const theme of ['dark', 'light'] as const)
    it(`is painted with Harmony's ${theme} tokens only, a figure's column marked, a secret never written`, () => {
      const pal = paletteFromTokens(tokens, theme);
      const allowed = new Set([...Object.values(pal.color), 'transparent']);
      const { ctx, rec } = recorder();
      drawGround(ctx, {
        scene: ground(input(), 'east'),
        palette: pal,
        hover: { row: 1, col: 2 },
        selected: { row: -1, col: 3 },
      });
      expect(rec.colors.filter((c) => !allowed.has(c))).toEqual([]);
      expect(rec.texts).toEqual(
        expect.arrayContaining([
          '◆ cups',
          'serial · key',
          'text · kept secret',
          'Masala chai',
          'empty',
          '••••',
          'Written by Take an order',
          'Read by See today’s orders',
          'orders · the ground',
        ]),
      );
      // The selected column's head is the folder: the one green object.
      expect(rec.fills).not.toContain(pal.color.folder);
      expect(rec.colors).toContain(pal.color.folder);
    });

  it('says why no row is shown, in its own words', () => {
    const pal = paletteFromTokens(tokens, 'dark');
    const { ctx, rec } = recorder();
    const none = { ...input(0), note: 'Rows not connected: no address in Settings.' };
    drawGround(ctx, { scene: ground(none), palette: pal, hover: null, selected: null });
    expect(rec.texts).toContain('Rows not connected: no address in Settings.');
  });
});
