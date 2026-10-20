import { describe, expect, it } from 'vitest';
import { fixtureBlueprint } from '../test/blueprint';
import { layout } from './layout';
import {
  activeEvent,
  brickState,
  clockText,
  currentTime,
  localHour,
  offsetMinutes,
  timeline,
} from './timeline';

const bp = fixtureBlueprint();
const tl = timeline(bp, layout(bp));

describe('timeline', () => {
  it('makes a lift per commit, lower floors first, and ignores files no longer in the building', () => {
    expect(tl.lifts.map((l) => l.events.map((e) => e.path))).toEqual([
      ['lib/data.ts', 'public/logo.png', 'lib/calc.ts', 'app/page.tsx'],
      ['lib/calc.test.ts', 'lib/calc.ts', 'lib/fmt.ts'],
      ['lib/data.ts', 'lib/calc.ts'],
    ]);
    expect(tl.lifts[0]!.events.map((e) => [e.t0, e.t1])).toEqual([
      [0, 0.25],
      [0.25, 0.5],
      [0.5, 0.75],
      [0.75, 1],
    ]);
  });

  it('calls a change "add" where the brick was laid, "demolish" at 20 or more deleted lines, else "modify"', () => {
    expect(tl.lifts[1]!.events.map((e) => [e.path, e.kind])).toEqual([
      ['lib/calc.test.ts', 'add'],
      ['lib/calc.ts', 'demolish'],
      ['lib/fmt.ts', 'add'],
    ]);
    expect(tl.lifts[2]!.events.every((e) => e.kind === 'modify')).toBe(true);
  });

  it('moves a brick from none to placing to built during its lift', () => {
    const at = (k: number, p: number) => brickState(tl, 'lib/calc.ts', k, p);
    expect(at(0, 0)).toBe('none');
    expect(at(1, 0.4)).toBe('none');
    expect(at(1, 0.6)).toBe('placing');
    expect(at(1, 0.75)).toBe('built');
    expect(at(2, 0)).toBe('built');
    expect(brickState(tl, 'unknown.ts', 3, 1)).toBe('none');
  });

  it('lays a brick that is not in the history only after the last lift', () => {
    const t = timeline(
      {
        ...bp,
        nodes: bp.nodes.map((n) => (n.path === 'lib/fmt.ts' ? { ...n, firstCommit: '' } : n)),
      },
      layout(bp),
    );
    expect(brickState(t, 'lib/fmt.ts', 3, 0.99)).toBe('none');
    expect(brickState(t, 'lib/fmt.ts', 3, 1)).toBe('built');
  });

  it('knows the event under way', () => {
    expect(activeEvent(tl, 2, 0.5)!.path).toBe('lib/calc.ts');
    expect(activeEvent(tl, 0, 0.5)).toBeNull();
    expect(activeEvent(tl, 2, 1)).toBeNull();
  });

  it("runs the clock between commits in the commit's own time zone", () => {
    expect(offsetMinutes('2026-09-28T17:41:59+05:30')).toBe(330);
    expect(offsetMinutes('2026-09-28T11:07:13Z')).toBe(0);
    expect(offsetMinutes('2026-09-28T11:07:13-04:00')).toBe(-240);
    const t = currentTime(tl, 3, 1)!;
    expect(clockText(t)).toBe('17:41 UTC+05:30');
    expect(localHour(currentTime(tl, 1, 1)!)).toBeCloseTo(11 + 7 / 60, 6); // to the minute
    // Halfway through lift 3, halfway between the two commits.
    const mid = currentTime(tl, 3, 0.5)!.ms;
    expect(mid).toBe(
      (Date.parse('2026-09-28T16:51:02+05:30') + Date.parse('2026-09-28T17:41:59+05:30')) / 2,
    );
    expect(currentTime(tl, 0, 0)).toBeNull();
  });
});
