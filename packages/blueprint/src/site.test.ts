import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixtureRepo, type FixtureRepo } from '../test/fixture-repo.ts';
import {
  addSite,
  checkSiteBlueprint,
  confirmEdge,
  confirmPurpose,
  listSites,
  locateSite,
  readSiteBlueprint,
  SELF_EXTRACT,
  SiteError,
  writeSiteOverlay,
  GLOSSARY_FILE,
  PURPOSES_FILE,
} from './site.ts';

let source: FixtureRepo;
let work: string;
let env: NodeJS.ProcessEnv;
const at = new Date('2026-10-20T10:00:00Z');

beforeAll(() => {
  source = fixtureRepo();
  source.write({
    'lib/data.ts': 'export const ROWS = [1, 2];\nexport type Row = number;\n',
    'lib/calc.ts':
      "import { ROWS, type Row } from './data';\nexport const total = (): Row => ROWS.length;\nexport const half = () => total() / 2;\n",
    'app/page.tsx': "import { total, half } from '../lib/calc';\nexport default function P() { return total() + half(); }\n",
    'app/other.tsx': "import { half } from '../lib/calc';\nexport default function O() { return half(); }\n",
    '.rama/glossary.json': JSON.stringify({
      'lib/data.ts#ROWS': { text: 'the rows' },
      Row: { text: 'the shape of a row' },
      'lib/calc.ts#total': { text: 'the row count' },
    }),
    '.rama/purposes.json': JSON.stringify({ 'lib/data.ts': { text: 'The rows.' } }),
  });
  source.commit('first');
  source.git('remote', 'add', 'origin', 'https://user:secret@example.com/team/fixture-app.git');
  work = mkdtempSync(path.join(tmpdir(), 'rama-work-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
});

afterAll(() => {
  source?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

describe('sites', () => {
  it('locates self as this repository with its own Blueprint, and nothing for an unknown or malformed id', () => {
    const self = locateSite('self', env)!;
    expect(self.blueprintPath.endsWith('blueprint/self.json')).toBe(true);
    expect(existsSync(path.join(self.repoDir, 'packages/blueprint/package.json'))).toBe(true);
    expect(self.options).toBe(SELF_EXTRACT);
    expect(locateSite('nope', env)).toBeNull();
    expect(locateSite('../etc', env)).toBeNull();
    expect(locateSite('Bad Id', env)).toBeNull();
  });

  it('adds a site: clones into work/<id>/repo, records it without credentials, extracts HEAD', () => {
    const { site, blueprint } = addSite(source.dir, { id: 'fixture', name: 'Fixture', env, now: () => at });
    expect(site.repoDir).toBe(path.join(work, 'fixture/repo'));
    expect(existsSync(path.join(site.repoDir, '.git'))).toBe(true);
    const record = JSON.parse(readFileSync(path.join(work, 'fixture/site.json'), 'utf8'));
    expect(record).toEqual({
      id: 'fixture',
      name: 'Fixture',
      source: source.dir,
      repo: 'https://example.com/team/fixture-app',
      addedAt: at.toISOString(),
    });
    expect(JSON.stringify(record)).not.toContain('secret');
    expect(blueprint.commit).toBe(source.git('rev-parse', 'HEAD').trim());
    expect(blueprint.branches).toContain('main');
    expect(readSiteBlueprint(site)).toEqual(blueprint);
    expect(checkSiteBlueprint(site).ok).toBe(true);
    expect(listSites(env).map((s) => s.id)).toEqual(['self', 'fixture']);
  });

  it('refuses an existing site, a bad id and "self"', () => {
    expect(() => addSite(source.dir, { id: 'fixture', env })).toThrow(SiteError);
    expect(() => addSite(source.dir, { id: 'Not OK', env })).toThrow(/not a site id/);
    expect(() => addSite(source.dir, { id: 'self', env })).toThrow(/cannot be added/);
  });

  it('confirm writes an overlay entry with the member and time, and the Blueprint shows it confirmed', () => {
    const site = locateSite('fixture', env)!;
    const before = readSiteBlueprint(site)!.edges.find((e) => e.from === 'lib/calc.ts')!;
    expect(before.english).toEqual({ text: 'the rows; the shape of a row', confirmed: false });

    const res = confirmEdge(site, { from: 'lib/calc.ts', to: 'lib/data.ts', shown: before.english!.text }, 'Asha Rao', at);
    expect(res.confirmed).toEqual(['lib/data.ts#ROWS', 'lib/data.ts#Row']);
    expect(res.missing).toEqual([]);
    const overlay = JSON.parse(readFileSync(path.join(site.repoDir, GLOSSARY_FILE), 'utf8'));
    expect(overlay['lib/data.ts#ROWS']).toEqual({ text: 'the rows', confirmedBy: 'Asha Rao', confirmedAt: at.toISOString() });
    // The bare phrase is copied path-qualified; the bare entry itself stays a draft for other files.
    expect(overlay['lib/data.ts#Row']).toEqual({ text: 'the shape of a row', confirmedBy: 'Asha Rao', confirmedAt: at.toISOString() });
    expect(overlay.Row).toEqual({ text: 'the shape of a row' });

    const after = res.blueprint.edges.find((e) => e.from === 'lib/calc.ts')!;
    expect(after.english).toEqual({
      text: 'the rows; the shape of a row',
      confirmed: true,
      by: 'Asha Rao',
      at: at.toISOString(),
    });
    expect(readSiteBlueprint(site)).toEqual(res.blueprint);
    // Code, history and refs still come from HEAD: the clone's commit is unchanged.
    expect(res.blueprint.commit).toBe(source.git('rev-parse', 'HEAD').trim());
    expect(res.blueprint.branches).toContain('main');
  });

  it('confirming again changes nothing', () => {
    const site = locateSite('fixture', env)!;
    const res = confirmEdge(site, { from: 'lib/calc.ts', to: 'lib/data.ts', shown: 'the rows; the shape of a row' }, 'Ravi', at);
    expect(res.confirmed).toEqual([]);
  });

  it('refuses a phrase that changed since it was shown, an unknown edge, an edge without a phrase, and no member', () => {
    const site = locateSite('fixture', env)!;
    const edge = { from: 'lib/calc.ts', to: 'lib/data.ts', shown: 'something else' };
    expect(() => confirmEdge(site, edge, 'Asha', at)).toThrow(/changed since it was shown/);
    expect(() => confirmEdge(site, { ...edge, to: 'nowhere.ts' }, 'Asha', at)).toThrow(/no dependency/);
    expect(() => confirmEdge(site, { from: 'app/other.tsx', to: 'lib/calc.ts', shown: '' }, 'Asha', at)).toThrow(/no phrase/);
    expect(() => confirmEdge(site, edge, '  ', at)).toThrow(/RAMA_MEMBER_NAME/);
  });

  it('reports symbols with no phrase as missing, confirms the rest, and the edge stays unconfirmed', () => {
    const site = locateSite('fixture', env)!;
    const res = confirmEdge(site, { from: 'app/page.tsx', to: 'lib/calc.ts', shown: 'the row count' }, 'Asha', at);
    expect(res.confirmed).toEqual(['lib/calc.ts#total']);
    expect(res.missing).toEqual(['half']);
    expect(res.blueprint.edges.find((e) => e.from === 'app/page.tsx')!.english).toEqual({ text: 'the row count', confirmed: false });
  });

  it('writes overlays as canonical JSON', () => {
    const site = locateSite('fixture', env)!;
    writeSiteOverlay(site, GLOSSARY_FILE, { b: { text: 'b' }, a: { text: 'a' } });
    expect(readFileSync(path.join(site.repoDir, GLOSSARY_FILE), 'utf8')).toBe(
      '{\n  "a": {\n    "text": "a"\n  },\n  "b": {\n    "text": "b"\n  }\n}\n',
    );
  });

  it('confirms a drafted purpose as shown', () => {
    const site = locateSite('fixture', env)!;
    expect(readSiteBlueprint(site)!.nodes.find((n) => n.path === 'lib/data.ts')!.purpose).toEqual({ text: 'The rows.', confirmed: false });
    expect(() => confirmPurpose(site, { path: 'lib/data.ts', shown: 'Other.' }, 'Asha', at)).toThrow(/changed/);
    expect(() => confirmPurpose(site, { path: 'lib/calc.ts', shown: 'x' }, 'Asha', at)).toThrow(/no purpose/);
    const res = confirmPurpose(site, { path: 'lib/data.ts', shown: 'The rows.' }, 'Asha', at);
    expect(res.confirmed).toEqual(['lib/data.ts']);
    expect(JSON.parse(readFileSync(path.join(site.repoDir, PURPOSES_FILE), 'utf8'))['lib/data.ts'].confirmedBy).toBe('Asha');
    expect(res.blueprint.nodes.find((n) => n.path === 'lib/data.ts')!.purpose).toEqual({
      text: 'The rows.',
      confirmed: true,
      by: 'Asha',
      at: at.toISOString(),
    });
  });
});
