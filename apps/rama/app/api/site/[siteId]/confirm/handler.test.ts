import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addSite, confirmEdge, confirmPurpose, locateSite } from '@rama/blueprint/site';
import {
  fixtureRepo,
  type FixtureRepo,
} from '../../../../../../../packages/blueprint/test/fixture-repo';
import { handleConfirm, type ConfirmDeps } from './handler';

let source: FixtureRepo;
let work: string;
let env: NodeJS.ProcessEnv;
const at = new Date('2026-10-20T12:00:00Z');

beforeAll(() => {
  source = fixtureRepo();
  source.write({
    'lib/data.ts': 'export const ROWS = [1];\n',
    'lib/calc.ts': "import { ROWS } from './data';\nexport const total = () => ROWS.length;\n",
    '.rama/glossary.json': JSON.stringify({ 'lib/data.ts#ROWS': { text: 'the rows' } }),
    '.rama/purposes.json': JSON.stringify({ 'lib/data.ts': { text: 'The rows.' } }),
  });
  source.commit('first');
  work = mkdtempSync(path.join(tmpdir(), 'rama-route-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  addSite(source.dir, { id: 'fixture', env });
});

afterAll(() => {
  source?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

const deps = (over: Partial<ConfirmDeps> = {}): ConfirmDeps & { log: ReturnType<typeof vi.fn> } => {
  const log = vi.fn(async () => {});
  return {
    locate: (id) => locateSite(id, env),
    memberName: 'Asha Rao',
    personId: async () => 'person-1',
    confirmEdge,
    confirmPurpose,
    now: () => at,
    ...over,
    log: (over.log as ReturnType<typeof vi.fn>) ?? log,
  } as ConfirmDeps & { log: ReturnType<typeof vi.fn> };
};

describe('POST /api/site/[siteId]/confirm', () => {
  it('confirms an edge as the local member, writes the overlay and logs it', async () => {
    const d = deps();
    const res = await handleConfirm(
      'fixture',
      { kind: 'edge', from: 'lib/calc.ts', to: 'lib/data.ts', shown: 'the rows' },
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      confirmed: ['lib/data.ts#ROWS'],
      missing: [],
      by: 'Asha Rao',
      at: at.toISOString(),
    });
    const overlay = JSON.parse(
      readFileSync(path.join(work, 'fixture/repo/.rama/glossary.json'), 'utf8'),
    );
    expect(overlay['lib/data.ts#ROWS']).toEqual({
      text: 'the rows',
      confirmedBy: 'Asha Rao',
      confirmedAt: at.toISOString(),
    });
    expect(d.log).toHaveBeenCalledWith({
      siteId: 'fixture',
      file: '.rama/glossary.json',
      keys: ['lib/data.ts#ROWS'],
      text: 'the rows',
      personId: 'person-1',
      at,
    });
  });

  it('confirms a purpose', async () => {
    const d = deps();
    const res = await handleConfirm(
      'fixture',
      { kind: 'purpose', path: 'lib/data.ts', shown: 'The rows.' },
      d,
    );
    expect(await res.json()).toMatchObject({ ok: true, confirmed: ['lib/data.ts'] });
    expect(d.log).toHaveBeenCalledWith(
      expect.objectContaining({ file: '.rama/purposes.json', keys: ['lib/data.ts'] }),
    );
  });

  it('logs nothing when nothing new was confirmed', async () => {
    const d = deps();
    const res = await handleConfirm(
      'fixture',
      { kind: 'edge', from: 'lib/calc.ts', to: 'lib/data.ts', shown: 'the rows' },
      d,
    );
    expect(await res.json()).toMatchObject({ ok: true, confirmed: [] });
    expect(d.log).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown site or edge, 400 for a bad body, 409 for a changed phrase or no member', async () => {
    const edge = { kind: 'edge', from: 'lib/calc.ts', to: 'lib/data.ts', shown: 'the rows' };
    expect((await handleConfirm('nope', edge, deps())).status).toBe(404);
    expect((await handleConfirm('fixture', { ...edge, to: 'x.ts' }, deps())).status).toBe(404);
    expect((await handleConfirm('fixture', { kind: 'edge' }, deps())).status).toBe(400);
    expect((await handleConfirm('fixture', null, deps())).status).toBe(400);
    expect((await handleConfirm('fixture', { ...edge, shown: 'other' }, deps())).status).toBe(409);
    const noMember = await handleConfirm('fixture', edge, deps({ memberName: ' ' }));
    expect(noMember.status).toBe(409);
    expect(await noMember.json()).toMatchObject({
      error: expect.stringMatching(/RAMA_MEMBER_NAME/),
    });
  });

  it('answers 503 and writes nothing when it cannot tell who is confirming', async () => {
    const before = readFileSync(path.join(work, 'fixture/repo/.rama/purposes.json'), 'utf8');
    const res = await handleConfirm(
      'fixture',
      { kind: 'purpose', path: 'lib/data.ts', shown: 'The rows.' },
      deps({ personId: async () => Promise.reject(new Error('database down')) }),
    );
    expect(res.status).toBe(503);
    expect(readFileSync(path.join(work, 'fixture/repo/.rama/purposes.json'), 'utf8')).toBe(before);
  });
});
