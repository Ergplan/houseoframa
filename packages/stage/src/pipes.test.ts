// The trail as plumbing (Stage 11): a pipe for every step the trail has, a dry one for every step it
// cannot derive, the water one step a second, pausable and steppable, and the same frame every time.
import { describe, expect, it } from 'vitest';
import tokens from '../../../design/harmony/tokens.json' with { type: 'json' };
import { recorder } from '../test/recorder.ts';
import { stallBlueprint, stallFeatures } from '../test/blueprint.ts';
import { building, type FacadeInput } from './building.ts';
import { parseFeatures, resolveFeatures } from './features.ts';
import { paletteFromTokens } from './palette.ts';
import {
  buildingPipes,
  drawPipes,
  flowAt,
  flowPlaces,
  groundTurn,
  runsThrough,
  insidePipes,
  streetPipes,
  type FlowLike,
} from './pipes.ts';
import { brickTop, inside, laidInOf } from './inside.ts';
import { at as streetAt, street } from './street.ts';
import { ORIENTATIONS, orientScene, orientStreet } from './camera.ts';

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

describe('water that runs out', () => {
  it('never runs past the first dry step, even where a later step has words', () => {
    const l = buildingPipes(sc, flow(null, null), () => null);
    // The formula has its words, but no water reaches it: the source before it is dry.
    expect(l.pipes.find((p) => p.step === 2)!.dry).toBe(false);
    const strokes: string[] = [];
    const { ctx } = recorder();
    const real = ctx.stroke.bind(ctx);
    (ctx as unknown as { stroke: () => void }).stroke = () => {
      strokes.push(String(ctx.strokeStyle));
      real();
    };
    const pal = paletteFromTokens(tokens, 'dark');
    drawPipes(ctx, l, pal, { step: 3, progress: 1 });
    expect(strokes).not.toContain(pal.color.harmony);
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

describe('the pipes inside a building', () => {
  const laid = laidInOf(bp);
  const b = s.buildings.find((x) => x.id === 'see-orders')!;
  const at = (o: (typeof ORIENTATIONS)[number]) =>
    inside(b, nodeOf, new Set(bp.screens.map((x) => x.file)), (p) => laid.get(p) ?? -1, o);

  it('runs a pipe for every step between the bricks, from every side, ending on the screen’s brick', () => {
    for (const o of ORIENTATIONS) {
      const sc2 = at(o);
      const l = insidePipes(sc2, flow('4 rows', '4'), () => 'db/orders.ts', 'app/page.tsx');
      expect(l.pipes.map((p) => p.step).sort()).toEqual([0, 1, 2, 3]);
      expect(l.pipes.every((p) => !p.dry)).toBe(true);
      const page = sc2.bricks.find((x) => x.path === 'app/page.tsx')!;
      expect(l.stops[3]).toEqual(brickTop(sc2, page));
      const orders = sc2.bricks.find((x) => x.path === 'db/orders.ts')!;
      expect(l.stops[0]).toEqual(brickTop(sc2, orders));
    }
  });

  it('draws a dry, labelled pipe for every untraced step', () => {
    const l = insidePipes(at('north'), flow(null, null), () => null, null);
    expect(l.pipes.filter((p) => p.dry).map((p) => p.step)).toEqual([0, 1, 3]);
    expect(l.pipes.find((p) => p.step === 0)!.label).toBe('Today’s orders: untraced');
    // No screen brick to reach: the screen step still has its pipe, up to the glass, dry and labelled.
    const screen = l.pipes.find((p) => p.step === 3)!;
    expect(screen.dry).toBe(true);
    expect(screen.label).toBe('untraced: no water reaches the screen');
    expect(l.stops[3]).toEqual(screen.points.at(-1));
  });
});

describe('the pipes along the Street', () => {
  const ownerOf = (file: string) => s.buildings.find((b) => b.bricks.includes(file))?.id ?? null;
  const sharedFile = s.buildings.find((b) => b.id === 'shared')!.bricks[0]!;
  const across = (value: string | null, shown: string | null): FlowLike => {
    const f = flow(value, shown);
    return {
      ...f,
      steps: f.steps.map((st) => (st.kind === 'function' ? { ...st, file: sharedFile } : st)),
    };
  };

  it('stands each step where it is kept: the table on its plot, the working-out in its building', () => {
    const pl = flowPlaces(across('[1]', '1'), ownerOf, 'see-orders');
    expect(pl.steps).toEqual([
      { table: 'orders' },
      { building: 'shared' },
      { building: 'shared' },
      { building: 'see-orders' },
    ]);
    expect(pl.crosses).toBe(true);
    // Kept in no table and worked out where it is shown: the trail stays in one building.
    const home = flow('[1]', '1');
    home.steps = home.steps.map((st) => (st.kind === 'source' ? { ...st, table: null } : st));
    expect(flowPlaces(home, ownerOf, 'see-orders').crosses).toBe(false);
    expect(streetPipes(s, home, ownerOf, 'see-orders')).toBeNull();
  });

  it('runs from the plot to the building that works it out, along the road to the one that shows it', () => {
    const l = streetPipes(s, across('[1]', '1'), ownerOf, 'see-orders')!;
    expect(l.pipes.map((p) => [p.step, p.dry])).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, false],
    ]);
    for (let i = 1; i < l.pipes.length; i++)
      expect(l.pipes[i]!.points[0]).toEqual(l.pipes[i - 1]!.points.at(-1));
    const p = streetAt(s);
    const plot = s.plots.find((x) => x.table === 'orders')!;
    expect(l.stops[0]).toEqual(p(plot.gx + plot.w / 2, plot.gy + plot.d / 2, 4));
    // The water to the screen runs along the road from "shared" to "see-orders", every bend of it.
    const road = s.roads.find((r) => r.from === 'see-orders' && r.to === 'shared')!;
    const screen = l.pipes.find((x) => x.step === 3)!;
    for (const q of [...road.points].reverse())
      expect(screen.points).toContainEqual(p(q.gx, q.gy, 4));
    const shows = s.buildings.find((b) => b.id === 'see-orders')!;
    expect(l.stops[3]).toEqual(
      p(shows.gx + shows.side / 2, shows.gy + shows.side / 2, shows.height * 0.9),
    );
  });

  it('gives a source kept where the figure is worked out its own pipe too, dry and labelled when empty', () => {
    const f = across('[1]', '1');
    f.steps = [
      { kind: 'source', label: 'The price', file: sharedFile, table: null, value: null },
      ...f.steps,
    ];
    const l = streetPipes(s, f, ownerOf, 'see-orders')!;
    expect(l.pipes.map((p) => p.step).sort()).toEqual([0, 1, 2, 3, 4]);
    const own = l.pipes.find((p) => p.step === 0)!;
    expect(own).toMatchObject({ dry: true, label: 'The price: untraced' });
    expect(own.points).toHaveLength(2);
    // No water runs past it.
    const { ctx } = recorder();
    const strokes: string[] = [];
    const real = ctx.stroke.bind(ctx);
    (ctx as unknown as { stroke: () => void }).stroke = () => {
      strokes.push(String(ctx.strokeStyle));
      real();
    };
    const pal = paletteFromTokens(tokens, 'dark');
    drawPipes(ctx, l, pal, { step: 4, progress: 1 });
    expect(strokes).not.toContain(pal.color.harmony);
  });

  it('draws the steps it cannot derive dry and labelled, and is the same from every side, every time', () => {
    const l = streetPipes(s, across(null, null), ownerOf, 'see-orders')!;
    expect(l.pipes.filter((p) => p.dry).map((p) => p.step)).toEqual([0, 1, 3]);
    for (const o of ORIENTATIONS) {
      const t = orientStreet(s, o);
      const a = streetPipes(t, across('[1]', '1'), ownerOf, 'see-orders')!;
      expect(a.pipes).toHaveLength(4);
      expect(JSON.stringify(streetPipes(t, across('[1]', '1'), ownerOf, 'see-orders'))).toBe(
        JSON.stringify(a),
      );
    }
  });
});

describe('a pipe over the ground where no road runs', () => {
  it('turns on the side that passes through fewer other buildings', () => {
    const b = (id: string, gx: number, gy: number) =>
      ({ id, gx, gy, side: 2 }) as unknown as (typeof s.buildings)[number];
    // From (0, 0) to (10, 10): the turn at (0, 10) passes a building standing at (0, 5).
    const blocker = [b('in-the-way', -1, 5)];
    expect(runsThrough(blocker, { gx: 0, gy: 0 }, { gx: 0, gy: 10 })).toBe(1);
    expect(groundTurn(blocker, { gx: 0, gy: 0 }, { gx: 10, gy: 10 })).toEqual({ gx: 10, gy: 0 });
    // Nothing in the way, or the same either side: the first turn.
    expect(groundTurn([], { gx: 0, gy: 0 }, { gx: 10, gy: 10 })).toEqual({ gx: 0, gy: 10 });
    // The two buildings it joins are never in its own way.
    expect(runsThrough(blocker, { gx: 0, gy: 0 }, { gx: 0, gy: 10 }, ['in-the-way'])).toBe(0);
  });
});
