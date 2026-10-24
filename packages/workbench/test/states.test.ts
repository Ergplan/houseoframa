// A site's states read the audience from the screens file as it is now, not from a capture: before the
// sample is photographed its staff screen already counts as staff, and a screen the file does not name
// is counted as unsaid, never as a customer's.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addSite, writeSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import { homeDir } from '@rama/db';
import { siteStates, unsaidSentence } from '../src/states.ts';

let work: string;
let site: SiteLocation;
let env: NodeJS.ProcessEnv;

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-states-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  execFileSync('node', [path.join(homeDir(), 'scripts/make-sample.mjs'), path.join(work, 'src')]);
  site = addSite(path.join(work, 'src'), { id: 'chai', name: 'Chai Stall', env }).site;
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('siteStates', () => {
  it('takes each screen’s audience from the screens file, with nothing photographed or tested yet', () => {
    const st = siteStates(site, writeSiteBlueprint(site), env);
    expect(st.screens.map((s) => [s.route, s.audience, s.state.state])).toEqual([
      ['/', 'customer', 'Unverified'],
      ['/new', 'customer', 'Unverified'],
      ['/total', 'staff', 'Unverified'],
    ]);
    expect(st.counts.map((c) => c.sentence)).toEqual([
      '0 of 2 customer screens signed',
      '0 of 1 staff screen signed',
    ]);
    expect(st.unsaid).toBe(0);
    expect(st.figures).toBeNull();
  });

  it('a screen the file does not name has no audience, and is counted as unsaid', () => {
    const file = path.join(site.repoDir, '.rama/screens.json');
    const cfg = JSON.parse(readFileSync(file, 'utf8')) as { screens: { route: string }[] };
    cfg.screens = cfg.screens.filter((s) => s.route !== '/total');
    writeFileSync(file, JSON.stringify(cfg));
    const st = siteStates(site, writeSiteBlueprint(site), env);
    expect(st.screens.find((s) => s.route === '/total')!.audience).toBeNull();
    expect(st.counts.map((c) => c.sentence)).toEqual(['0 of 2 customer screens signed']);
    expect(st.unsaid).toBe(1);
    expect(unsaidSentence(1)).toBe('1 screen does not say who it is for');
    expect(unsaidSentence(17)).toBe('17 screens do not say who they are for');
  });
});
