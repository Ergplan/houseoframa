/// <reference lib="dom" />
// A canvas context that records what is painted: every colour set and every text written. Enough of the
// 2D context for the lakefront's draw functions.
export interface Recording {
  colors: string[];
  texts: string[];
  images: number;
  /** Fill colours in order, with the polygon's first point. */
  fills: string[];
}

export function recorder(): { ctx: CanvasRenderingContext2D; rec: Recording } {
  const rec: Recording = { colors: [], texts: [], images: 0, fills: [] };
  const state: Record<string, unknown> = {};
  const noop = () => {};
  const methods: Record<string, unknown> = {
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    stroke: noop,
    fill: () => rec.fills.push(String(state.fillStyle)),
    roundRect: noop,
    arc: noop,
    ellipse: noop,
    save: noop,
    restore: noop,
    clip: noop,
    transform: noop,
    setLineDash: noop,
    drawImage: () => rec.images++,
    fillText: (t: string) => rec.texts.push(t),
    measureText: (t: string) => ({ width: t.length * 6 }),
    createRadialGradient: () => ({ addColorStop: (_: number, c: string) => rec.colors.push(c) }),
  };
  const ctx = new Proxy(
    {},
    {
      get: (_, k: string) => (k in methods ? methods[k] : state[k]),
      set: (_, k: string, v: unknown) => {
        if (
          (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') &&
          typeof v === 'string'
        )
          rec.colors.push(v);
        state[k] = v;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, rec };
}
