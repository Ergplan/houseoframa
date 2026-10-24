// Test drive (rule 16) end to end against a throwaway database and work dir, with no keys: the sample is
// built afresh, drawn, built and photographed, tested, walked and signed, and audited by the stand-in;
// each step passes with a plain sentence, and the screens land in the three states the script expects.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { audits, createDb, decisions, runMigrations, signoffs, type Db } from '@rama/db';
import { jobStatus, latestJob, readJob } from '../src/jobs.ts';
import { startTestDrive } from '../src/testdrive.ts';

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
  // No keys anywhere: the audit's stand-in is used, and nothing reaches a vendor.
  env = {
    ...process.env,
    RAMA_WORK_DIR: work,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GITHUB_TOKEN: '',
  };
});

afterAll(async () => {
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
      'Street',
      'Build',
      'Tests',
      'Walkthrough',
      'Three states',
      'Audit',
    ]);
    expect(Date.now() - t).toBeLessThan(5 * 60_000);
    expect(jobStatus(end)).toBe('passed');
    expect(readJob(end.id, env)).toEqual(end);
    expect(latestJob('testdrive', null, env)!.id).toBe(end.id);
    expect(end.steps.find((s) => s.name === 'Build')!.sentence).toBe(
      '3 screens photographed; 8 of 8 figures traced; 8 of 8 re-computed by the product’s own code.',
    );
    expect(end.steps.find((s) => s.name === 'Tests')!.sentence).toBe('2 of 2 test files passed.');
    expect(end.steps.find((s) => s.name === 'Three states')!.sentence).toBe(
      '2 Confirmed, 1 Verified, 0 Unverified; 2 of 2 customer screens signed; 0 of 1 staff screen signed.',
    );
    expect(end.steps.find((s) => s.name === 'Audit')!.sentence).toMatch(
      /passed on by a stand-in \(no auditor key\)\.$/,
    );

    // The records: a decided first card by name, sealed signatures by "Test drive", a stand-in audit.
    await withDb(async (db) => {
      const cards = await db.select().from(decisions).where(eq(decisions.siteId, 'testdrive-1'));
      expect(cards.map((c) => [c.status, c.by])).toEqual([
        ['open', 'Test drive'],
        ['decided', 'Test drive'],
      ]);
      const sigs = await db.select().from(signoffs).where(eq(signoffs.siteId, 'testdrive-1'));
      expect(sigs.map((s) => [s.person, s.targetId, Boolean(s.seal)]).sort()).toEqual([
        ['Test drive', '/', true],
        ['Test drive', '/new', true],
      ]);
      const [a] = await db.select().from(audits).where(eq(audits.siteId, 'testdrive-1'));
      expect(a!.vendor).toBe('stand-in');
    });
  });

  it('a second run starts a fresh product and clears the first one’s checkout', async () => {
    const { done } = startTestDrive(withDb, 'Asha Rao', env);
    const end = await done;
    expect(end.ok).toBe(true);
    expect(existsSync(path.join(work, 'testdrive-1'))).toBe(false);
    expect(existsSync(path.join(work, 'testdrive-2', 'repo'))).toBe(true);
  });
});
