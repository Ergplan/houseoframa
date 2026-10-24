// The pod floor against a throwaway database and a real fixture site: bookings and their refusals, and
// the light moving blue → amber → blue → green as the site is photographed, signed and audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import {
  ensurePerson,
  audits,
  createDb,
  modelCalls,
  pods,
  runMigrations,
  seed,
  sites,
  type Member,
} from '@rama/db';
import { addSite } from '@rama/blueprint/site';
import { generateSigningKey, requireSealer, sign } from '@rama/ceremony';
import { fixtureRepo, type FixtureRepo } from '../../../packages/blueprint/test/fixture-repo';
import { book, podState } from './floor';

const serverUrl = process.env.DATABASE_URL!;
const original = process.env.RAMA_WORK_DIR;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let repo: FixtureRepo;
let work: string;
let asha: Member;
let ravi: Member;
let commit: string;
let repoDir: string;
const at = (h: number) => new Date(Date.UTC(2026, 9, 23, h));

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' });
  asha = await ensurePerson(conn.db, { name: 'Asha Rao', role: 'member' }, 'test');
  ravi = await ensurePerson(conn.db, { name: 'Ravi', role: 'member' }, 'test');
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'app/page.tsx': 'export default function H() { return 1; }\n',
  });
  commit = repo.commit('shop');
  work = mkdtempSync(path.join(tmpdir(), 'rama-floor-'));
  process.env.RAMA_WORK_DIR = work;
  repoDir = addSite(repo.dir, { id: 'shop', name: 'Shop', env: process.env }).site.repoDir;
  await conn.db
    .insert(sites)
    .values({ siteId: 'shop', name: 'Shop', repo: repo.dir, memberId: asha.id, createdBy: 'test' });
  await conn.db.insert(pods).values([
    { pod: 1, name: 'Window', createdBy: 'test' },
    { pod: 2, name: 'Corner', createdBy: 'test' },
  ]);
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  if (original === undefined) delete process.env.RAMA_WORK_DIR;
  else process.env.RAMA_WORK_DIR = original;
  repo?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

describe('booking a pod', () => {
  it('books work on an owned site, or game mode, and refuses what does not fit', async () => {
    expect(
      await book(conn.db, asha, {
        pod: 1,
        shift: 'work',
        siteId: 'shop',
        startsAt: at(9),
        endsAt: at(13),
      }),
    ).toMatchObject({ pod: 1, siteId: 'shop', personId: asha.id });
    await expect(
      book(conn.db, ravi, { pod: 1, shift: 'game', startsAt: at(12), endsAt: at(14) }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await book(conn.db, ravi, { pod: 1, shift: 'game', startsAt: at(13), endsAt: at(15) }),
    ).toMatchObject({ shift: 'game', siteId: null });
    await expect(
      book(conn.db, ravi, {
        pod: 2,
        shift: 'work',
        siteId: 'shop',
        startsAt: at(9),
        endsAt: at(10),
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      book(conn.db, asha, { pod: 9, shift: 'game', startsAt: at(9), endsAt: at(10) }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      book(conn.db, asha, { pod: 2, shift: 'game', startsAt: at(10), endsAt: at(9) }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      book(conn.db, asha, { pod: 2, shift: 'work', startsAt: at(9), endsAt: at(10) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lets one of two simultaneous bookings of a slot through, never both', async () => {
    const r = await Promise.allSettled([
      book(conn.db, asha, { pod: 2, shift: 'game', startsAt: at(18), endsAt: at(20) }),
      book(conn.db, ravi, { pod: 2, shift: 'game', startsAt: at(19), endsAt: at(21) }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
});

describe('the pod light', () => {
  it('maps the booking to its site, and moves blue → amber → blue → green as the site is photographed, signed and audited', async () => {
    const now = at(10);
    let s = (await podState(conn.db, 1, now))!;
    expect(s.site?.siteId).toBe('shop');
    expect(s.light).toBe('blue');
    // Photographed at the current commit: awaiting sign-off.
    mkdirSync(path.join(work, 'shop'), { recursive: true });
    writeFileSync(
      path.join(work, 'shop', 'capture.json'),
      JSON.stringify({ version: 1, site: 'shop', commit, screens: [], mappings: {}, runs: {} }),
    );
    expect((await podState(conn.db, 1, now))!.light).toBe('amber');
    // Signed, but not audited.
    await sign(
      conn.db,
      { id: 'shop', repoDir },
      {
        person: 'Asha Rao',
        personId: asha.id,
        sealer: requireSealer({ RAMA_SIGNING_KEY: generateSigningKey().privateKey }),
        target: { kind: 'screen', id: '/', commit },
        statement: 'ok',
        at: now,
      },
    );
    expect((await podState(conn.db, 1, now))!.light).toBe('blue');
    // Signed and audited clean at this commit.
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
      at: now,
      report: { counts: { defects: 0, notes: 0, passes: 2, bricks: 2 } },
      createdBy: 'test',
    });
    s = (await podState(conn.db, 1, now))!;
    expect(s.light).toBe('green');
    expect((await podState(conn.db, 1, at(14)))!.light).toBe('pink');
    expect((await podState(conn.db, 1, at(16)))!).toMatchObject({ light: 'off', booking: null });
    expect(await podState(conn.db, 7, now)).toBeNull();
  });
});
