import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Blueprint } from '@rama/shared';
import { fixtureBlueprint } from '../test/blueprint';
import { draw, type Ctx } from './draw';

/** A canvas context that records what is painted. */
function recorder() {
  const calls: { op: string; args: unknown[]; style?: unknown }[] = [];
  const ctx = {
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect(...args: number[]) {
      calls.push({ op: 'fillRect', args, style: this.fillStyle });
    },
    strokeRect(...args: number[]) {
      calls.push({ op: 'strokeRect', args, style: this.strokeStyle });
    },
    fillText(...args: unknown[]) {
      calls.push({ op: 'fillText', args, style: this.fillStyle });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      calls.push({ op: 'stroke', args: [], style: this.strokeStyle });
    },
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return { ctx: ctx as unknown as Ctx, calls };
}

const bp = fixtureBlueprint();
const base = { blueprint: bp, selection: null, glow: new Set<string>(), audit: null };
const texts = (calls: { op: string; args: unknown[] }[]) =>
  calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);

describe('draw', () => {
  it('paints the cleared site with its invitation and no door', () => {
    const { ctx, calls } = recorder();
    draw(ctx, { ...base, commitIndex: 0, progress: 0 });
    expect(texts(calls)).toContain('SITE CLEARED · PRESS PLAY');
    expect(texts(calls)).not.toContain('SHOWROOM');
    expect(texts(calls)).toContain('SITE OFFICE · DISCOVERY');
  });

  it('paints every built brick at its place, the floor counts, the door and the banner', () => {
    const { ctx, calls } = recorder();
    const f = draw(ctx, { ...base, commitIndex: 3, progress: 1 });
    for (const b of f.bricks) {
      expect(
        calls.some(
          (c) =>
            c.op === 'fillRect' &&
            c.args[0] === Math.round(b.box.x) &&
            c.args[1] === Math.round(b.box.y) &&
            c.style === b.box.color,
        ),
      ).toBe(true);
    }
    expect(texts(calls)).toEqual(
      expect.arrayContaining([
        'SHOWROOM',
        '2/2',
        '3/3',
        'COMMIT 3/3  c3ccccc  THIRD LIFT',
        'ALL LIFTS IN · AWAITING SIGN-OFF',
        'JOULEWISE',
        'RACHIT',
        'main',
      ]),
    );
  });

  it('paints the demolition tag and the cables of a selection', () => {
    const { ctx, calls } = recorder();
    draw(ctx, { ...base, commitIndex: 2, progress: 0.5, selection: 'lib/data.ts' });
    expect(texts(calls)).toContain('+30 −26');
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(1); // lib/calc.ts → lib/data.ts
  });

  it('paints a real repository at every lift without throwing', () => {
    const self = JSON.parse(
      readFileSync(new URL('../../../blueprint/self.json', import.meta.url), 'utf8'),
    ) as Blueprint;
    for (let k = 0; k <= self.commits.length; k++) {
      const { ctx } = recorder();
      expect(() =>
        draw(ctx, { ...base, blueprint: self, commitIndex: k, progress: 0.5 }),
      ).not.toThrow();
    }
  });
});
