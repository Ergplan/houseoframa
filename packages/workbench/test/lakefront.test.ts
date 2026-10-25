// The sample product's lakefront: its three buildings in the owner's words from .rama/features.json, the
// table it defines on the ground, flags from the screens' states, and facades only from a capture of
// the commit shown.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { addSite, writeSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import { homeDir } from '@rama/db';
import { buildingState } from '@rama/blueprint/metrics';
import { siteLakefront } from '../src/lakefront.ts';

let work: string;
let site: SiteLocation;
let env: NodeJS.ProcessEnv;
let bp: Blueprint;

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-lakefront-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  execFileSync('node', [path.join(homeDir(), 'scripts/make-sample.mjs'), path.join(work, 'src')]);
  site = addSite(path.join(work, 'src'), { id: 'chai', name: 'Chai Stall', env }).site;
  bp = writeSiteBlueprint(site);
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const capture = (commit: string) => {
  mkdirSync(path.join(work, 'chai'), { recursive: true });
  writeFileSync(
    path.join(work, 'chai', 'capture.json'),
    JSON.stringify({
      version: 1,
      site: 'chai',
      commit,
      capturedAt: '2026-10-25T00:00:00Z',
      viewport: { width: 390, height: 700 },
      screens: [
        {
          name: 'orders',
          title: 'Today’s orders',
          route: '/',
          role: null,
          audience: 'customer',
          shot: 'orders.png',
          width: 390,
          height: 700,
          blueprintScreen: bp.screens.find((s) => s.route === '/')!.id,
          bricks: [],
          figures: [
            {
              id: 'order-count',
              origin: 'attribute',
              text: '4',
              box: { x: 10, y: 60, w: 20, h: 20 },
            },
            { id: 'odd', origin: 'detected', text: '7', box: { x: 10, y: 90, w: 20, h: 20 } },
          ],
        },
      ],
      mappings: {
        'order-count': {
          fn: 'orderCount',
          file: 'lib/money.ts',
          line: 15,
          origin: 'convention',
          code: '',
        },
      },
      runs: {},
    }),
  );
};

describe('siteLakefront', () => {
  it('names the buildings in the owner’s words, one per thing the stall does', () => {
    const lf = siteLakefront(site, bp, env);
    expect(lf.named).toBe(true);
    expect(lf.problem).toBeNull();
    expect(
      lf.street.buildings.filter((b) => b.kind === 'feature').map((b) => [b.name, b.does !== null]),
    ).toEqual([
      ['See today’s orders', true],
      ['Take an order', true],
      ['Count the day’s takings', true],
    ]);
    // The table the stall defines is a plot; no screen's code reads it yet (the stall reads its sample day).
    expect(lf.street.plots.map((p) => [p.table, p.readBy, p.writtenBy])).toEqual([
      ['orders', [], []],
    ]);
  });

  it('flags each building from its screens’ states', () => {
    const lf = siteLakefront(site, bp, env);
    for (const b of lf.street.buildings) {
      const states = lf.states.screens.filter((s) => b.screens.includes(s.id)).map((s) => s.state);
      expect(lf.flags[b.id]).toEqual(buildingState(states));
    }
    expect(Object.values(lf.flags).map((f) => f.state)).toEqual(
      lf.street.buildings.map(() => 'Unverified'),
    );
  });

  it('puts a facade up only from a capture of the commit shown', () => {
    expect(siteLakefront(site, bp, env).street.buildings[0]!.facades).toEqual([
      { screen: bp.screens.find((s) => s.route === '/')!.id, shot: null },
    ]);
    capture('0000000');
    expect(siteLakefront(site, bp, env).street.buildings[0]!.facades[0]!.shot).toBeNull();
    capture(bp.commit);
    const lf = siteLakefront(site, bp, env);
    expect(lf.street.buildings[0]!.facades[0]!.shot).toBe('/api/site/chai/shots/orders.png');
    expect(lf.facades['see-todays-orders']![0]!.figures.map((f) => [f.key, f.traced])).toEqual([
      ['orders/order-count', true],
      ['orders/odd', false],
    ]);
  });

  it('drafts the buildings from the screens, and says why, when the features file does not parse', () => {
    writeFileSync(path.join(site.repoDir, '.rama/features.json'), '{"features": [{"id": "Bad"}]}');
    const lf = siteLakefront(site, bp, env);
    expect(lf.problem).toMatch(/does not match its schema/);
    expect(lf.named).toBe(false);
    expect(lf.street.buildings.filter((b) => b.kind === 'feature').map((b) => b.name)).toEqual([
      'Home',
      'New',
      'Total',
    ]);
  });
});
