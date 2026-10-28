// Stage 5, CI-safe: the `rama-audit` command checks a crafted site (no model), and the app replays a
// stored audit in a real browser: the drones fly, the live log fills, the report reads as signed, and the
// brick inspector shows the brick's latest verdict. The audit is written straight into a throwaway
// database here, signed by a stand-in auditor call; the real auditor runs in the @vendor test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { chromium, type Browser } from 'playwright';
import { audits, createDb, findings, modelCalls, runMigrations, seed, sites } from '@rama/db';
import { addSite } from '../packages/blueprint/src/site.ts';
import { auditChecks } from '../packages/audit/src/checks/index.ts';
import { inputsHash, number, type AuditorInput } from '../packages/audit/src/auditor.ts';
import { fixtureRepo, type FixtureRepo } from '../packages/blueprint/test/fixture-repo.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { pageAs, signIn, withSession } from './session.ts';

const AUDIT = fileURLToPath(new URL('../packages/audit/bin/rama-audit.mjs', import.meta.url));
const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let repo: FixtureRepo;
let work: string;
let server: DevServer;
let browser: Browser;
let token: string;

beforeAll(async () => {
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/bids.ts':
      'export const spread = (bids: number[]) => {\n  const s = [...bids].sort((a, b) => a - b);\n  return s[2] - s[0];\n};\n',
    'app/page.tsx':
      "import { spread } from '../lib/bids';\nexport default function Home() { return spread([1, 2, 3]); }\n",
  });
  repo.commit('a spread that assumes three bids');
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e5-'));
  const env = { ...process.env, RAMA_WORK_DIR: work };
  const { site, blueprint: bp } = addSite(repo.dir, { id: 'shop', name: 'Shop', env });

  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const conn = createDb(dbUrl);
  await runMigrations(conn.db);
  const { member } = await seed(conn.db, { memberName: 'Asha Rao' });
  await conn.db.insert(sites).values({
    siteId: 'shop',
    name: 'Shop',
    repo: repo.dir,
    memberId: member.id,
    createdBy: 'rama:e2e@0',
  });
  // A stored audit, as runAudit writes it, signed by a stand-in auditor call.
  const results = auditChecks({
    repoDir: site.repoDir,
    bp,
    signoffs: [],
    decisions: [],
    formulaFiles: [],
    run: false,
  });
  const input = {
    site: 'Shop',
    commit: bp.commit,
    defects: number(results.findings),
  } as unknown as AuditorInput;
  const [call] = await conn.db
    .insert(modelCalls)
    .values({
      siteId: 'shop',
      prompt: 'audit',
      promptVersion: 1,
      promptHash: 'h',
      role: 'auditor',
      vendor: 'openai',
      model: 'gpt-e2e',
      input: input as object,
      status: 'ok',
      attempts: 1,
      ms: 1,
      createdBy: 'rama:audit@0.1.0',
    })
    .returning();
  const [a] = await conn.db
    .insert(audits)
    .values({
      siteId: 'shop',
      commit: bp.commit,
      vendor: 'openai',
      model: 'gpt-e2e',
      callId: call!.id,
      inputsHash: inputsHash(input),
      at: new Date(),
      report: {
        runs: results.runs,
        counts: { defects: 1, notes: 0, passes: bp.nodes.length - 1, bricks: bp.nodes.length },
        narration: [
          { part: 'discovery', text: 'No decisions are recorded.' },
          { part: 'verdict', text: 'One defect: the spread takes the third bid by position.' },
        ],
        alterations: [
          {
            title: 'Generalise the spread to any number of bids',
            agentTime: '15 min',
            humanTime: 'review 15 min',
            kind: 'defect',
            findings: ['F1'],
          },
        ],
        timeMachine: [],
        verdictChanges: [],
        signoffs: [],
        builders: ['Fixture'],
      },
      createdBy: 'rama:audit@0.1.0',
    })
    .returning();
  await conn.db.insert(findings).values([
    ...results.findings.map((f) => ({
      siteId: 'shop',
      auditId: a!.id,
      brick: f.brick,
      check: f.check,
      verdict: f.verdict,
      checkVerdict: f.verdict,
      text: f.text,
      line: f.line ?? null,
      createdBy: 'rama:audit@0.1.0',
    })),
    ...bp.nodes
      .filter((n) => !results.findings.some((f) => f.brick === n.path))
      .map((n) => ({
        siteId: 'shop',
        auditId: a!.id,
        brick: n.path,
        check: 'all',
        verdict: 'pass' as const,
        checkVerdict: 'pass' as const,
        text: 'No check that ran found anything here.',
        createdBy: 'rama:audit@0.1.0',
      })),
  ]);
  await conn.close();

  token = await signIn(dbUrl, { name: 'Asha Rao' });
  server = await startDevServer({ RAMA_WORK_DIR: work, DATABASE_URL: dbUrl }, [
    '/site/shop',
    '/site/shop/audit',
  ]);
  browser = await chromium.launch();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  repo?.cleanup();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('stage 5 e2e', () => {
  it('rama-audit check finds the positional assumption without running the target or a model', () => {
    const r = spawnSync(process.execPath, [AUDIT, 'check', 'shop', '--no-run'], {
      encoding: 'utf8',
      env: { ...process.env, RAMA_WORK_DIR: work, DATABASE_URL: dbUrl },
    });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as {
      findings: { check: string; brick: string; verdict: string; line: number }[];
      runs: { check: string; ran: boolean }[];
    };
    expect(out.findings.filter((f) => f.verdict === 'defect')).toEqual([
      expect.objectContaining({ check: 'positional-assumption', brick: 'lib/bids.ts', line: 3 }),
    ]);
    expect(out.runs.filter((x) => !x.ran).map((x) => x.check)).toEqual([
      'typecheck',
      'build',
      'test-coverage-per-brick',
    ]);
    expect(r.stderr).toContain('1 defects');
  });

  it('replays the audit on the building: drones, live log, the report, and the verdict in the brick view', async () => {
    const page = await pageAs(browser, server, token, { viewport: { width: 1400, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      // The drones fly inside the building, over its bricks (Stage 11: the inside replaced the Stage 2
      // canvas); the building that holds the defective brick.
      await page.goto(`${server.browserUrl}/site/shop?at=code&brick=lib%2Fbids.ts`);
      await page
        .locator('[data-level="inside"] canvas[data-ready="true"]')
        .waitFor({ timeout: 60_000 });
      const button = page.getByRole('button', { name: 'Fly the audit', exact: true });
      await expect.poll(() => button.isEnabled(), { timeout: 30_000 }).toBe(true);
      await button.click();
      await page.getByText('Drones are flying the site.').waitFor();
      await page.locator('.alog .aph', { hasText: 'Audit requested' }).waitFor();
      await page.getByRole('button', { name: 'Skip to the report' }).click();
      const report = page.locator('aside.mon');
      await report.getByRole('heading', { name: /Audit report/ }).waitFor();
      await expect(report.locator('[data-defects]').getAttribute('data-defects')).resolves.toBe(
        '1',
      );
      await expect(report.textContent()).resolves.toContain(
        'Generalise the spread to any number of bids',
      );
      await expect(report.textContent()).resolves.toContain('Signed by openai gpt-e2e');
      // The finder opens the defective brick: its latest verdict is in the Brick view.
      await page.getByLabel('Find a part by its file').fill('lib/bids.ts');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.locator('.verdict[data-verdict="defect"]').waitFor();
      await expect(page.locator('.verdict').textContent()).resolves.toContain(
        'Takes item 2 of a sorted list',
      );
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it('serves the report page, verified against the auditor call', async () => {
    const html = await (
      await fetch(`${server.url}/site/shop/audit`, { headers: withSession(token) })
    ).text();
    expect(html).toContain('data-verified="true"');
    expect(html).toContain('One defect: the spread takes the third bid by position.');
  });
});
