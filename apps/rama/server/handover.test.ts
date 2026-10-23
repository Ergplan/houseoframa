// The handover against a throwaway database and a real fixture site: what stands in the way, the
// structure confirmed by name, the handover record, the check-ins; and the campus page's numbers, which
// must be metrics.campusFigures over the same records.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  addMember,
  audits,
  createDb,
  issueLink,
  modelCalls,
  pods,
  redeemLink,
  runMigrations,
  seed,
  sites,
  type Member,
} from '@rama/db';
import { addSite, readSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import { campusFigures } from '@rama/blueprint/metrics';
import { sign } from '@rama/ceremony';
import { confirmStructure } from '@rama/ceremony/structure';
import { fixtureRepo, type FixtureRepo } from '../../../packages/blueprint/test/fixture-repo';
import { checkIn, handOver, handoverState } from './handover';
import { campusInputs } from './campus';
import { book } from './floor';

let cookie: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'rama_session' && cookie ? { value: cookie } : undefined),
  }),
}));

const serverUrl = process.env.DATABASE_URL!;
const original = { db: process.env.DATABASE_URL, work: process.env.RAMA_WORK_DIR };
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let repo: FixtureRepo;
let work: string;
let asha: Member;
let site: SiteLocation;
let commit: string;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL = Object.assign(new URL(serverUrl), {
    pathname: `/${dbName}`,
  }).toString();
  conn = createDb();
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' });
  asha = await addMember(conn.db, {
    email: 'asha@example.com',
    name: 'Asha Rao',
    createdBy: 'test',
  });
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/core.ts': 'export const core = 1;\n',
    'lib/a.ts': "import { core } from './core';\nexport const a = core;\n",
    'lib/b.ts': "import { core } from './core';\nexport const b = core;\n",
    'app/page.tsx':
      "import { core } from '../lib/core';\nimport { a } from '../lib/a';\nimport { b } from '../lib/b';\nexport default function H() { return core + a + b; }\n",
  });
  commit = repo.commit('shop');
  work = mkdtempSync(path.join(tmpdir(), 'rama-handover-'));
  process.env.RAMA_WORK_DIR = work;
  site = addSite(repo.dir, { id: 'shop', name: 'Shop', env: process.env }).site;
  await conn.db
    .insert(sites)
    .values({ siteId: 'shop', name: 'Shop', repo: repo.dir, memberId: asha.id, createdBy: 'test' });
});

afterAll(async () => {
  await conn?.close();
  process.env.DATABASE_URL = original.db;
  if (original.work === undefined) delete process.env.RAMA_WORK_DIR;
  else process.env.RAMA_WORK_DIR = original.work;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  repo?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

describe('the handover', () => {
  it('says what stands in the way, and refuses to hand over or check in before it is ready', async () => {
    const st = (await handoverState(conn.db, site))!;
    expect(st.readiness.reasons).toEqual([
      `1 of 1 screens are not signed at ${commit.slice(0, 7)}`,
      `no audit of ${commit.slice(0, 7)}`,
      'nobody has confirmed the structure',
    ]);
    expect(st.draft).toEqual([{ path: 'lib/core.ts', importedBy: 3 }]);
    await expect(handOver(conn.db, asha, site)).rejects.toThrow(/^not ready: /);
    await expect(checkIn(conn.db, asha, site, { inUse: true })).rejects.toThrow(
      /not been handed over/,
    );
  });

  it('hands over once every screen is signed, the audit is clean and the structure confirmed; then takes check-ins', async () => {
    await sign(
      conn.db,
      { id: 'shop', repoDir: site.repoDir },
      {
        person: 'Asha Rao',
        personId: asha.id,
        target: { kind: 'screen', id: '/', commit },
        statement: 'ok',
        at: new Date(),
      },
    );
    const [call] = await conn.db
      .insert(modelCalls)
      .values({
        siteId: 'shop',
        prompt: 'audit',
        promptVersion: 1,
        promptHash: 'h',
        role: 'auditor',
        vendor: 'openai',
        model: 'm',
        input: {},
        status: 'ok',
        attempts: 1,
        ms: 1,
        createdBy: 'test',
      })
      .returning();
    await conn.db.insert(audits).values({
      siteId: 'shop',
      commit,
      vendor: 'openai',
      model: 'm',
      callId: call!.id,
      inputsHash: 'h',
      at: new Date(),
      report: { counts: { defects: 0, notes: 0, passes: 5, bricks: 5 } },
      createdBy: 'test',
    });
    confirmStructure(site.repoDir, readSiteBlueprint(site)!, 'Asha Rao', new Date());
    expect((await handoverState(conn.db, site))!.readiness).toEqual({ ready: true, reasons: [] });
    const h = await handOver(conn.db, asha, site, new Date('2026-07-01T00:00:00Z'));
    expect(h).toMatchObject({ siteId: 'shop', commit, person: 'Asha Rao' });
    expect((h.structure as { bricks: unknown[] }).bricks).toEqual([
      { path: 'lib/core.ts', importedBy: 3 },
    ]);
    await checkIn(
      conn.db,
      asha,
      site,
      { inUse: true, note: 'every day' },
      new Date('2026-10-05T00:00:00Z'),
    );
    const st = (await handoverState(conn.db, site))!;
    expect(st.handover).toMatchObject({ person: 'Asha Rao', commit });
    expect(st.checkins).toEqual([
      { at: '2026-10-05T00:00:00.000Z', inUse: true, note: 'every day' },
    ]);
    const audited =
      await conn.sql`select count(*)::int as n from audit_log where table_name = 'handovers'`;
    expect(audited[0]!.n).toBe(1);
  });
});

describe('/campus', () => {
  it('shows exactly the figures metrics.campusFigures gives over the same records, to a manager only', async () => {
    await conn.db.insert(pods).values({ pod: 1, name: 'Window', createdBy: 'test' });
    await book(conn.db, asha, {
      pod: 1,
      shift: 'work',
      siteId: 'shop',
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() + 3_600_000),
    });
    const ravi = await addMember(conn.db, {
      email: 'ravi@example.com',
      name: 'Ravi',
      role: 'manager',
      createdBy: 'test',
    });
    const sessionOf = async (email: string) =>
      (await redeemLink(conn.db, (await issueLink(conn.db, email))!.token))!.sessionToken;
    const { default: Campus } = await import('../app/campus/page');
    cookie = await sessionOf('asha@example.com');
    await expect(Campus()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    cookie = await sessionOf(ravi.email!);
    const html = renderToStaticMarkup(await Campus());
    const f = campusFigures((await campusInputs(conn.db)).sites, new Date());
    expect(html).toContain(`data-figure="audits-passed">${f.auditsPassed}</b>`);
    expect(html.replace(/<!-- -->/g, '')).toContain(
      `data-figure="in-use-90">${f.inUseAt90.inUse} / ${f.inUseAt90.of}</b>`,
    );
    expect(f).toMatchObject({ sites: 2, auditsPassed: 1, inUseAt90: { inUse: 1, of: 1 } });
    expect(html).toContain('data-pod="1" data-light="green"');
    for (const p of f.signaturesPending) expect(html).toContain(`data-pending="${p.person}"`);
  });
});
