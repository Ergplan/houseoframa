import { describe, expect, it } from 'vitest';
import { fixtureBlueprint } from '../test/blueprint';
import { frame, siteModel, skyAt, type SiteState } from './frame';

const bp = fixtureBlueprint();
const state = (over: Partial<SiteState> = {}): SiteState => ({
  blueprint: bp,
  commitIndex: 0,
  progress: 0,
  selection: null,
  glow: new Set(),
  audit: null,
  ...over,
});

describe('frame', () => {
  it('shows a cleared site before the first lift, with no door and no banner', () => {
    const f = frame(state());
    expect(f).toMatchObject({
      cleared: true,
      door: false,
      banner: null,
      complete: false,
      bricks: [],
    });
  });

  it("hangs the brick being laid from the crane of the commit's author", () => {
    const f = frame(state({ commitIndex: 1, progress: 0.6 }));
    expect(f.hook!.box.path).toBe('lib/calc.ts');
    expect(f.activeCrane).toBe(0);
    expect(f.bricks.map((b) => b.box.path)).toEqual(['lib/data.ts', 'public/logo.png']);
    expect(f.banner).toBe('COMMIT 1/3  c1aaaaa  FIRST LIFT');
  });

  it('sends the JCB to a brick when a lift knocks 20 or more lines out of it', () => {
    const f = frame(state({ commitIndex: 2, progress: 0.5 }));
    const calc = siteModel(bp).scene.byPath.get('lib/calc.ts')!;
    expect(f.jcb.busy).toBe(true);
    expect(f.jcb.x).toBe(calc.x + calc.w / 2 - 70);
    expect(f.dust.length).toBeGreaterThan(0);
    expect(f.bricks.find((b) => b.box.path === 'lib/calc.ts')!.change).toEqual({
      kind: 'demolish',
      tag: '+30 −26',
    });
    expect(frame(state({ commitIndex: 3, progress: 0.9 })).jcb).toEqual({
      x: 40,
      busy: false,
      arm: 0,
    });
  });

  it('is complete after the last lift, with every brick built and counted per floor', () => {
    const f = frame(state({ commitIndex: 3, progress: 1 }));
    expect(f.complete).toBe(true);
    expect(f.bricks).toHaveLength(bp.nodes.length);
    expect(f.floors.map((x) => [x.floor.id, x.built, x.total])).toEqual([
      ['data', 2, 2],
      ['logic', 3, 3],
      ['shell', 1, 1],
    ]);
  });

  it('draws import cables for the selection: imports one colour, importers the other', () => {
    const f = frame(state({ commitIndex: 3, progress: 1, selection: 'lib/calc.ts' }));
    expect(f.cables.map((c) => [c.from.path, c.to.path, c.color])).toEqual([
      ['app/page.tsx', 'lib/calc.ts', '#ffb429'],
      ['lib/calc.test.ts', 'lib/calc.ts', '#ffb429'],
      ['lib/calc.ts', 'lib/data.ts', '#4fe3d8'],
    ]);
    expect(f.selected!.path).toBe('lib/calc.ts');
    // Hover draws cables only with links on.
    expect(frame(state({ commitIndex: 3, progress: 1, hover: 'lib/calc.ts' })).cables).toEqual([]);
    expect(
      frame(state({ commitIndex: 3, progress: 1, hover: 'lib/calc.ts', links: true })).cables,
    ).toHaveLength(3);
  });

  it('glows only built bricks and carries audit verdicts', () => {
    const f = frame(
      state({
        commitIndex: 1,
        progress: 1,
        glow: new Set(['lib/fmt.ts', 'lib/data.ts']),
        audit: { verdicts: { 'lib/data.ts': 'defect' } },
      }),
    );
    expect(f.glow.map((b) => b.path)).toEqual(['lib/data.ts']);
    expect(f.bricks.find((b) => b.box.path === 'lib/data.ts')!.verdict).toBe('defect');
    expect(f.banner).toBeNull(); // the audit owns the top of the screen
  });

  it('takes the sky from the commit time: day at 11:07, dusk at 17:41', () => {
    expect(frame(state({ commitIndex: 1, progress: 1 })).sky).toMatchObject({ night: 0 });
    expect(frame(state({ commitIndex: 1, progress: 1 })).sky.sun).not.toBeNull();
    const dusk = frame(state({ commitIndex: 3, progress: 1 })).sky;
    expect(dusk.hour).toBeCloseTo(17.7, 1);
    const scene = siteModel(bp).scene;
    expect(skyAt(2, scene)).toMatchObject({ night: 1, sun: null });
    expect(skyAt(12, scene).top).toBe('rgb(63,111,184)');
  });
});
