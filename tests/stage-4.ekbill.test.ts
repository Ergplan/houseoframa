// Stage 4 on EkBill, the real target: a walkthrough in the real app signs two of its captured screens,
// and the gate on EkBill's real history passes those two and fails a changed screen nobody signed.
// Everything runs on a copy: a fresh clone of the EkBill checkout, its capture copied beside it, and a
// throwaway database. The site's own records, and the user's signatures, are left untouched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { chromium, type Browser } from 'playwright';
import { createDb, runMigrations, seed, signoffs, sites } from '@rama/db';
import { addSite, locateSite } from '../packages/blueprint/src/site.ts';
import { captureDir, readCapture } from '../packages/trace/src/showroom.ts';
import { readSignoffs } from '../packages/ceremony/src/records.ts';
import { runGate, type GateResult } from '../packages/ceremony/src/gate.ts';
import { startDevServer, type DevServer } from './dev-server.ts';

const SITE = 'ekbill-e2e';
const MEMBER = 'Walkthrough Tester';
const SIGN = ['/gst', '/dues'];
const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let env: NodeJS.ProcessEnv;
let repoDir: string;
let server: DevServer;
let browser: Browser;

beforeAll(async () => {
  const ekbill = locateSite('ekbill')!;
  work = mkdtempSync(path.join(tmpdir(), 'rama-stage4-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  repoDir = addSite(ekbill.repoDir, { id: SITE, name: 'EkBill (e2e copy)', env }).site.repoDir;
  // The capture of the real site, at the commit the clone is at.
  for (const part of ['capture.json', 'shots']) {
    cpSync(path.join(captureDir('ekbill'), part), path.join(captureDir(SITE, env), part), {
      recursive: true,
    });
  }
  const cap = readCapture(SITE, env)!;
  expect(cap.commit).toBe(
    execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  );

  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const conn = createDb(dbUrl);
  await runMigrations(conn.db);
  const { member } = await seed(conn.db, { memberName: MEMBER });
  await conn.db.insert(sites).values({
    siteId: SITE,
    name: 'EkBill (e2e copy)',
    repo: ekbill.repoDir,
    memberId: member.id,
    createdBy: 'rama:e2e@0',
  });
  await conn.close();

  server = await startDevServer(
    { RAMA_WORK_DIR: work, DATABASE_URL: dbUrl, RAMA_MEMBER_NAME: MEMBER },
    [`/site/${SITE}/walkthrough`],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('stage 4 on EkBill', () => {
  it("signs two screens in the walkthrough, under the member's name, in Postgres and in .rama/signoffs.jsonl", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${server.browserUrl}/site/${SITE}/walkthrough`);
      for (const screen of SIGN) {
        await page
          .locator('.strip button', { hasText: screen })
          .filter({ hasNotText: `${screen}/` })
          .first()
          .click();
        const mon = page.locator(`aside.mon[data-screen="${screen}"]`);
        await mon.waitFor();
        await expect(mon.locator('[data-state="unsigned"]').count()).resolves.toBe(1);
        await mon.getByRole('button', { name: `Confirm and sign as ${MEMBER}` }).click();
        await mon.locator('[data-state="signed"]').waitFor({ timeout: 30_000 });
      }
      await expect(page.locator('.lede b').textContent()).resolves.toMatch(/^2 of \d+$/);
    } finally {
      await page.close();
    }
    const records = readSignoffs(repoDir);
    expect(records.map((s) => [s.person, s.target.kind, s.target.id])).toEqual(
      SIGN.map((id) => [MEMBER, 'screen', id]),
    );
    const conn = createDb(dbUrl);
    try {
      expect((await conn.db.select().from(signoffs)).map((r) => r.id).sort()).toEqual(
        records.map((r) => r.id).sort(),
      );
      const audit = await conn.sql`select row_id from audit_log where table_name = 'signoffs'`;
      expect(audit.map((r) => r.row_id).sort()).toEqual(records.map((r) => r.id).sort());
    } finally {
      await conn.close();
    }
  });

  it('gates on the real history: the two signed screens pass, a changed screen nobody signed fails', () => {
    // The signatures travel with the code: commit them in the copy, as EkBill's team would.
    execFileSync('git', ['-C', repoDir, 'add', '.rama/signoffs.jsonl']);
    execFileSync('git', [
      '-C',
      repoDir,
      '-c',
      'user.name=e2e',
      '-c',
      'user.email=e2e@example.invalid',
      'commit',
      '-q',
      '-m',
      'signatures',
    ]);
    const r: GateResult = runGate(repoDir, 'HEAD~2');
    const by = (route: string) => r.screens.find((s) => s.route === route)!;
    for (const s of SIGN)
      expect(by(s), s).toMatchObject({
        ok: true,
        reason: expect.stringMatching(new RegExp(`^signed by ${MEMBER} at `)),
      });
    expect(by('/bills')).toMatchObject({
      ok: false,
      reason: 'no signature, and no test report was given',
    });
    expect(r.ok).toBe(false);

    // And a quiet rewrite of a signature fails the gate whatever the screens say.
    const file = path.join(repoDir, '.rama/signoffs.jsonl');
    writeFileSync(file, readFileSync(file, 'utf8').replace(MEMBER, 'Someone Else'));
    execFileSync('git', [
      '-C',
      repoDir,
      '-c',
      'user.name=e2e',
      '-c',
      'user.email=e2e@example.invalid',
      'commit',
      '-qam',
      'rewrite',
    ]);
    expect(runGate(repoDir, 'HEAD~1').problems[0]).toMatch(/rewritten/);
  });
});
