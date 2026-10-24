// @vendor, Stage 5 on the sample product (in place of EkBill since Stage 7): a real audit of the Chai
// Stall (its own typecheck, build and tests, and the auditor from AUDITOR_VENDOR), then the report read in
// the app. It writes real model_calls rows (into a throwaway database) and costs one auditor call. Run with
// `RAMA_VENDOR_TESTS=1 pnpm vitest run --project e2e tests/stage-5.sample.vendor`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createDb, runMigrations, seed, sites } from '@rama/db';
import { locateSite, readSiteBlueprint } from '../packages/blueprint/src/site.ts';
import { readCapture } from '../packages/trace/src/showroom.ts';
import { latestAudit, runAudit, verifyReport } from '../packages/audit/src/report.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { sampleSite } from './sample.ts';
import { signIn, withSession } from './session.ts';

const SITE = 'chai-audit';
const serverUrl = process.env.DATABASE_URL!;
const original = process.env.DATABASE_URL;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let server: DevServer;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-stage5-'));
  const { site } = await sampleSite(work, SITE);
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  // packages/model records the auditor's call through DATABASE_URL: this test's database.
  process.env.DATABASE_URL = dbUrl;
  const conn = createDb(dbUrl);
  await runMigrations(conn.db);
  const { member } = await seed(conn.db, { memberName: 'Audit Tester' });
  await conn.db.insert(sites).values({
    siteId: SITE,
    name: 'Chai Stall',
    repo: site.repoDir,
    memberId: member.id,
    createdBy: 'rama:e2e@0',
  });
  await conn.close();
}, 900_000);

afterAll(async () => {
  await server?.stop();
  process.env.DATABASE_URL = original;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('@vendor stage 5 on the sample product', () => {
  it('@vendor audits the sample product with the auditor vendor, signs the report, and the app shows it verified', async () => {
    const env = { ...process.env, RAMA_WORK_DIR: work };
    const site = locateSite(SITE, env)!;
    const bp = readSiteBlueprint(site)!;
    const formulaFiles = [
      ...new Set(Object.values(readCapture(SITE, env)!.mappings).map((m) => m.file)),
    ];
    const conn = createDb(dbUrl);
    try {
      const { report, body } = await runAudit(conn.db, {
        siteId: SITE,
        name: site.name,
        repoDir: site.repoDir,
        bp,
        formulaFiles,
      });
      expect(report.vendor).toBe(process.env.AUDITOR_VENDOR);
      expect(report.vendor).not.toBe(process.env.BUILDER_VENDOR);
      expect(body.runs.every((r) => r.ran)).toBe(true);
      expect(body.narration.length).toBeGreaterThan(0);
      expect(await verifyReport(conn.db, report)).toEqual({ ok: true });
      expect((await latestAudit(conn.db, SITE))!.report.reportId).toBe(report.reportId);
    } finally {
      await conn.close();
    }
    server = await startDevServer({ RAMA_WORK_DIR: work, DATABASE_URL: dbUrl }, [
      `/site/${SITE}/audit`,
    ]);
    const token = await signIn(dbUrl, { name: 'Audit Tester' });
    const html = await (
      await fetch(`${server.url}/site/${SITE}/audit`, { headers: withSession(token) })
    ).text();
    expect(html).toContain('data-verified="true"');
    expect(html).toContain(`Signed by <b>${process.env.AUDITOR_VENDOR}</b>`);
  }, 1_800_000);
});
