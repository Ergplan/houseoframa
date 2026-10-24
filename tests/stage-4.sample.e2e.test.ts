// Stage 4 on the sample product (in place of EkBill since Stage 7): a walkthrough in the real app signs
// two of its photographed screens, and the gate on its real history passes those two and fails a
// changed screen nobody signed; a quiet rewrite of a signature fails the gate whatever the screens say.
// Everything runs in a temporary work dir and a throwaway database, so it runs in CI.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { chromium, type Browser } from 'playwright';
import { createDb, runMigrations, seed, signoffs } from '@rama/db';
import { readSignoffs } from '../packages/ceremony/src/records.ts';
import { runGate, type GateResult } from '../packages/ceremony/src/gate.ts';
import { generateSigningKey } from '../packages/ceremony/src/seal.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { sampleSite } from './sample.ts';
import { pageAs, signIn } from './session.ts';

const SITE = 'chai';
// The app seals every signature with this key; the gate checks seals against its public half.
const KEY = generateSigningKey();
const MEMBER = 'Walkthrough Tester';
const SIGN = ['/', '/new'];
const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let repoDir: string;
let server: DevServer;
let browser: Browser;
let token: string;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-stage4-'));
  const { site } = await sampleSite(work, SITE);
  repoDir = site.repoDir;

  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const conn = createDb(dbUrl);
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: MEMBER });
  await conn.close();

  token = await signIn(dbUrl, { name: MEMBER }, [{ id: SITE, name: 'Chai Stall', repo: repoDir }]);
  server = await startDevServer(
    { RAMA_WORK_DIR: work, DATABASE_URL: dbUrl, RAMA_SIGNING_KEY: KEY.privateKey },
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

describe('stage 4 on the sample product', () => {
  it("signs two screens in the walkthrough, under the member's name, in Postgres and in .rama/signoffs.jsonl", async () => {
    const page = await pageAs(browser, server, token);
    try {
      await page.goto(`${server.browserUrl}/site/${SITE}/walkthrough`);
      for (const screen of SIGN) {
        // The strip names each screen by its route, after its mark: match the whole route.
        const route = screen.replace(/[/]/g, '\\/');
        await page
          .locator('.strip button')
          .filter({ hasText: new RegExp(`[○●·] ${route}$`) })
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
    // The signatures travel with the code: commit them in the copy, as the product's builder would.
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
    const r: GateResult = runGate(repoDir, 'HEAD~4', { publicKey: KEY.publicKey });
    const by = (route: string) => r.screens.find((s) => s.route === route)!;
    for (const s of SIGN)
      expect(by(s), s).toMatchObject({
        ok: true,
        reason: expect.stringMatching(new RegExp(`^signed by ${MEMBER} at `)),
      });
    expect(by('/total')).toMatchObject({
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
    expect(runGate(repoDir, 'HEAD~1', { publicKey: KEY.publicKey }).problems[0]).toMatch(
      /rewritten/,
    );
  });
});
