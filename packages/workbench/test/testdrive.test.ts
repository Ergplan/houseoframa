// Test drive (rule 16) end to end against a throwaway database and work dir, with no keys: the sample's
// cards are decided, the recording of a real build replays through the build loop lift by lift (each
// lift checked: lint, tests, photographs, figures, gate), the Street is named as the cards say, every
// figure is traced and every screen Verified; then it is walked and signed and audited by the stand-in.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import {
  audits,
  createDb,
  decisions,
  modelCalls,
  runMigrations,
  signoffs,
  type Db,
} from '@rama/db';
import { dropSandboxes, readRows, rowsSource, type GroundRows } from '../src/ground.ts';
import { jobStatus, latestJob, readJob } from '../src/jobs.ts';
import { latestTestDrive, startTestDrive } from '../src/testdrive.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let env: NodeJS.ProcessEnv;

const withDb = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const c = createDb(dbUrl);
  try {
    return await fn(c.db);
  } finally {
    await c.close();
  }
};

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  await withDb((db) => runMigrations(db));
  work = mkdtempSync(path.join(tmpdir(), 'rama-testdrive-'));
  // No keys anywhere: the audit's stand-in is used, and nothing reaches a vendor. The seats are set
  // here, not taken from the machine's setup file, so CI (which names no models) says the same.
  env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    RAMA_WORK_DIR: work,
    RAMA_TESTDRIVE_BUILDER: '',
    BUILDER_VENDOR: 'anthropic',
    AUDITOR_VENDOR: 'openai',
    OPENAI_MODEL: 'gpt-6.1-sol',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GITHUB_TOKEN: '',
  };
});

afterAll(async () => {
  // The sample product's own database, made by its photographs (Stage 11).
  if (env) await dropSandboxes(env);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('Test drive', () => {
  it('runs the whole loop on the sample product with no keys, and says pass in words', async () => {
    const t = Date.now();
    const { job, done } = startTestDrive(withDb, 'Asha Rao', env);
    expect(jobStatus(job)).toBe('running');
    const end = await done;
    const steps = end.steps.map((s) => [s.name, s.ok, s.sentence]);
    expect(end.ok, JSON.stringify(steps, null, 2)).toBe(true);
    expect(end.steps.map((s) => s.name)).toEqual([
      'Idea',
      'Builder',
      'Lift 0: the house stack',
      'Lift 1',
      'Lift 2',
      'Lift 3',
      'Lift 4',
      'Built',
      'Street',
      'Traced',
      'Tests',
      'Walkthrough',
      'Three states',
      'Audit',
    ]);
    // Minutes, as rule 16 asks: about three alone; the bound leaves room for the watcher beside it.
    expect(Date.now() - t).toBeLessThan(15 * 60_000);
    expect(jobStatus(end)).toBe('passed');
    expect(readJob(end.id, env)).toEqual(end);
    expect(latestJob('testdrive', null, env)!.id).toBe(end.id);
    const said = (name: string) => end.steps.find((s) => s.name === name)!;
    // No key: the recording of a real build replays, through the same loop and the same checks.
    expect(said('Builder').sentence).toBe(
      'Claude Code (recorded) builds the stall: no Anthropic key is set.',
    );
    // The real builder's first lift was refused by the gate; the grey flag says why and what is next,
    // and the next lift is the fix.
    expect(said('Lift 1')).toMatchObject({
      ok: false,
      next: 'The builder fixes this in the next lift.',
    });
    expect(said('Lift 1').sentence).toMatch(
      /The merge gate refuses the screen \/: it changed and no passing check stands behind db\/orders\.ts, db\/schema\.ts\.$/,
    );
    for (const n of [0, 2, 3, 4])
      expect(end.steps.find((s) => s.name.startsWith(`Lift ${n}`))!.ok).toBe(true);
    expect(said('Built').sentence).toBe(
      'Built in 4 lifts: 8 of 8 figures traced, 3 of 3 screens Verified.',
    );
    expect(said('Street').sentence).toBe(
      'The Street has 3 buildings, named as the cards name them: “See today’s orders”, “Take an order”, “Count the day’s takings”.',
    );
    expect(said('Traced').sentence).toBe(
      '8 of 8 figures traced and worked out again the same; all 3 screens Verified before anyone signs.',
    );
    expect(said('Tests').sentence).toBe('7 of 7 test files passed.');
    expect(said('Three states').sentence).toBe(
      '2 Confirmed, 1 Verified, 0 Unverified; 2 of 2 customer screens signed; 0 of 1 staff screen signed.',
    );
    expect(end.steps.find((s) => s.name === 'Audit')!.sentence).toMatch(
      /passed on by a stand-in \(no auditor key\)\.$/,
    );

    // The records: a decided first card by name, sealed signatures by "Test drive", a stand-in audit.
    await withDb(async (db) => {
      const cards = await db.select().from(decisions).where(eq(decisions.siteId, 'testdrive-1'));
      // Every card of the brief opened, then decided by the recorded yes, by name.
      expect(cards).toHaveLength(14);
      expect(cards.filter((c) => c.status === 'decided' && c.by === 'Test drive')).toHaveLength(7);
      const sigs = await db.select().from(signoffs).where(eq(signoffs.siteId, 'testdrive-1'));
      expect(sigs.map((s) => [s.person, s.targetId, Boolean(s.seal)]).sort()).toEqual([
        ['Test drive', '/', true],
        ['Test drive', '/new', true],
      ]);
      const [a] = await db.select().from(audits).where(eq(audits.siteId, 'testdrive-1'));
      expect(a!.vendor).toBe('stand-in');
      // No key: nothing reached a vendor; the one row is the audit's stand-in.
      const calls = await db.select().from(modelCalls);
      expect(calls.map((c) => [c.role, c.vendor])).toEqual([['auditor', 'stand-in']]);
    });
    // The recorded build's English is in this run's own work dir, every sentence of it.
    expect(readdirSync(path.join(work, 'testdrive-1', 'explain')).sort()).toEqual(
      readdirSync(
        path.resolve(import.meta.dirname, '../../../fixtures/sample-build/explanations'),
      ).sort(),
    );
  });

  it('a second run starts a fresh product and keeps the first one, signature journal and all', async () => {
    const { done } = startTestDrive(withDb, 'Asha Rao', env);
    const end = await done;
    expect(end.ok).toBe(true);
    expect(end.about).toBe('testdrive-2');
    expect(existsSync(path.join(work, 'testdrive-1', 'repo', '.rama', 'signoffs.jsonl'))).toBe(
      true,
    );
    expect(existsSync(path.join(work, 'testdrive-2', 'repo'))).toBe(true);
    expect(latestTestDrive(['testdrive-1', 'testdrive-2', 'testdrive-10', 'chai'])).toBe(
      'testdrive-10',
    );
  });
});

describe('the sample product’s own database (Stage 11)', () => {
  it('is made by its photographs and holds the sample day, written in by the stall itself', async () => {
    const src = await rowsSource({ id: 'testdrive-1', kind: 'product' }, null as never, env);
    expect(src.kind).toBe('sandbox');
    const bp = JSON.parse(readFileSync(path.join(work, 'testdrive-1', 'blueprint.json'), 'utf8'));
    const orders = bp.tables.find((t: { name: string }) => t.name === 'orders');
    const r = (await readRows((src as { url: string }).url, orders)) as GroundRows;
    expect(r).toMatchObject({ total: 4, today: 4, missing: [] });
    // Written by the product's own code the first time its first page opened, with its provenance.
    const col = (row: (string | null)[], name: string) => row[r.columns.indexOf(name)];
    const fields = ['item', 'cups', 'created_by', 'site_id'];
    expect(r.rows.map((x) => fields.map((f) => col(x, f)))).toEqual(
      expect.arrayContaining([
        ['Masala chai', '2', 'sample', 'testdrive-1'],
        ['Ginger chai', '1', 'sample', 'testdrive-1'],
        ['Masala chai', '3', 'sample', 'testdrive-1'],
        ['Lemon tea', '1', 'sample', 'testdrive-1'],
      ]),
    );
  });
});

describe('the test run records what ran', () => {
  it('per test file, the product functions its worker executed', () => {
    const run = JSON.parse(
      readFileSync(path.join(work, 'testdrive-1', 'tests.json'), 'utf8'),
    ) as import('@rama/blueprint/metrics').TestRun;
    expect(run.executed!['features/count-the-days-takings/takings.test.ts']).toEqual([
      'features/count-the-days-takings/takings.ts#gstOnTakings',
      'features/count-the-days-takings/takings.ts#todaysTakings',
    ]);
    // A screen's own test ran its page's component, and the figures through their Figure.
    expect(run.executed!['app/total/page.test.tsx']).toEqual(
      expect.arrayContaining(['app/total/page.tsx#TodaysTotal', 'components/Figure.tsx#Figure']),
    );
    expect(Object.keys(run.executed!)).toHaveLength(7);
  });
});
