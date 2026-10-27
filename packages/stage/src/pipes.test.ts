// The trail as plumbing (Stage 11): a pipe for every step the trail has, a dry one for every step it
// cannot derive, the water one step a second, pausable and steppable, and the same frame every time.
import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { building, type FacadeInput } from './building.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { paletteFromTokens } from './palette.ts';
import { buildingPipes, drawPipes, flowAt, type FlowLike } from './pipes.ts';
import { street } from './street.ts';
import { ORIENTATIONS, orientScene } from './camera.ts';

const bp = stallBlueprint();
const s = street(bp, resolveFeatures(bp, parseFeatures(stallFeatures)), {});
const facade: FacadeInput = {
  screen: '/',
  title: 'Today’s orders',
  shot: 'orders.png',
  width: 390,
  height: 1600,
  figures: [
    {
      key: '/~order-count',
      id: 'order-count',
      traced: true,
      text: '4',
      box: { x: 20, y: 100, w: 40, h: 30 },
    },
  ],
};
const nodeOf = (p: string) => bp.nodes.find((n) => n.path === p)!;
const sc = building(
  s.buildings.find((b) => b.id === 'see-orders')!,
  [facade],
  nodeOf,
  new Set(bp.screens.map((x) => x.file)),
);
const bricks = sc.floors.flatMap((f) => f.bricks.map((b) => b.path));
const fnFile = bricks.find((p) => p !== 'db/orders.ts')!;

const flow = (value: string | null, shown: string | null): FlowLike => ({
  key: '/~order-count',
  steps: [
    { kind: 'source', label: 'Today’s orders', file: null, table: 'orders', value },
    {
      kind: 'function',
      label: 'ordersSoFar',
      file: fnFile,
      table: null,
      value: shown === null ? null : '4',
    },
    {
      kind: 'formula',
      label: 'Orders so far',
      file: fnFile,
      table: null,
      value: 'the number of orders',
    },
    { kind: 'screen', label: 'Today’s orders', file: null, table: null, value: shown },
  ],
});

describe('the pipes of a figure', () => {
  it('lays a pipe for every step the trail has, from the table’s part of the building to the figure', () => {
    const l = buildingPipes(sc, flow('[1,2,3,4]', '4'), (t) =>
      t === 'orders' ? 'db/orders.ts' : null,
    );
    // A pipe for each step: the rows to the function, up as it is worked out, across as the formula
    // is applied, down onto the figure.
    expect(l.pipes.map((p) => [p.step, p.dry])).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, false],
    ]);
    // Each pipe starts where the one before ends.
    for (let i = 1; i < l.pipes.length; i++)
      expect(l.pipes[i]!.points[0]).toEqual(l.pipes[i - 1]!.points.at(-1));
    // Every step has a place its value shows; the source is the table's own part of the building.
    expect(l.stops.every(Boolean)).toBe(true);
    expect(l.pipes[0]!.points[0]).toEqual(l.stops[0]);
    expect(l.pipes.at(-1)!.points.at(-1)).toEqual(l.stops[3]);
  });

  it('runs a dry, broken pipe for a step it cannot derive, and labels it untraced', () => {
    const l = buildingPipes(sc, flow(null, null), () => null);
    expect(l.pipes.map((p) => [p.step, p.dry, p.label])).toEqual([
      [0, true, 'Today’s orders: untraced'],
      [1, true, 'worked out again: untraced'],
      [2, false, null],
      [3, true, 'untraced: no water reaches the screen'],
    ]);
    // Kept nowhere in this building: the pipe comes up from the ground under it.
    const bottom = (sc.faces.right[0]!.y + sc.faces.right[1]!.y) / 2;
    expect(l.pipes[0]!.points[0]!.y).toBeGreaterThan(bottom);
    const { ctx, rec } = recorder();
    drawPipes(ctx, l, paletteFromTokens(tokens, 'dark'), { step: 3, progress: 1 });
    expect(rec.texts).toEqual([
      'Today’s orders: untraced',
      'worked out again: untraced',
      'untraced: no water reaches the screen',
    ]);
  });

  it('is laid the same from every side, and the same every time', () => {
    for (const o of ORIENTATIONS) {
      const t = orientScene(sc, o);
      const a = buildingPipes(t, flow('[1]', '1'), () => 'db/orders.ts');
      expect(JSON.stringify(buildingPipes(t, flow('[1]', '1'), () => 'db/orders.ts'))).toBe(
        JSON.stringify(a),
      );
      expect(a.pipes).toHaveLength(4);
    }
  });
});

describe('a figure whose working-out stands in another building', () => {
  it('still gets every pipe, from the ground under this building', () => {
    const elsewhere = { ...flow('[1]', '1') };
    elsewhere.steps = elsewhere.steps.map((st) =>
      st.kind === 'function' ? { ...st, file: 'elsewhere.ts' } : st,
    );
    const l = buildingPipes(sc, elsewhere, () => null);
    expect(l.pipes.map((p) => p.step)).toEqual([0, 1, 2, 3]);
  });
});

describe('the water', () => {
  it('moves one step a second, stops at the end, and can be held or stepped', () => {
    expect(flowAt(4, 0)).toEqual({ step: 0, progress: 0, done: false });
    expect(flowAt(4, 1500)).toEqual({ step: 1, progress: 0.5, done: false });
    expect(flowAt(4, 3999).step).toBe(3);
    expect(flowAt(4, 9000)).toEqual({ step: 3, progress: 1, done: true });
    // Held: the same moment gives the same frame. Stepped: a step is a second.
    expect(flowAt(4, 2 * 1000)).toEqual({ step: 2, progress: 0, done: false });
  });
});
