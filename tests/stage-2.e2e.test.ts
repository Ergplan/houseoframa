// Stage 2 end to end, in a real browser on the real dev server:
//  - /site/self renders this repository's own Blueprint (rule 14); clicking a brick on the canvas opens
//    it in the inspector with its dependencies in English.
//  - On a cloned site, Confirm writes the member's confirmation into the target's .rama/glossary.json,
//    the Blueprint is regenerated, the inspector shows the phrase confirmed, and audit_log has the row.
// The confirming site is a throwaway clone in a temporary work dir with a throwaway database, so the
// test never writes into this repository or the dev database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import postgres from 'postgres';
import type { Blueprint } from '@rama/shared';
import { createDb, runMigrations, seed } from '@rama/db';
import { addSite } from '../packages/blueprint/src/site.ts';
import { registerSite } from '../packages/blueprint/src/register.ts';
import { fixtureRepo, type FixtureRepo } from '../packages/blueprint/test/fixture-repo.ts';
import { layout } from '../apps/rama/canvas/layout.ts';
import { startDevServer, type DevServer } from './dev-server.ts';

const MEMBER = 'E2E Member';
const serverUrl = process.env.DATABASE_URL;
if (!serverUrl)
  throw new Error('DATABASE_URL is not set: this test needs the Postgres from docker-compose.yml');
const dbName = `rama_e2e_${randomBytes(4).toString('hex')}`;
const testUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });

let work: string;
let source: FixtureRepo;
let server: DevServer;
let browser: Browser;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const conn = createDb(testUrl);
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: MEMBER });
  await conn.close();

  source = fixtureRepo();
  source.write({
    'lib/data.ts': 'export const ROWS = [1, 2, 3];\n',
    'lib/calc.ts': "import { ROWS } from './data';\nexport const total = () => ROWS.length;\n",
    'app/page.tsx':
      "import { total } from '../lib/calc';\nexport default function Home() { return total(); }\n",
    '.rama/glossary.json': JSON.stringify({
      'lib/data.ts#ROWS': { text: 'the rows the app counts' },
    }),
  });
  source.commit('first lift');
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e-work-'));
  addSite(source.dir, {
    id: 'fixture',
    name: 'Fixture',
    env: { ...process.env, RAMA_WORK_DIR: work },
  });
  await registerSite(
    { siteId: 'fixture', name: 'Fixture', repo: 'fixture', memberName: MEMBER },
    testUrl,
  );

  server = await startDevServer(
    { DATABASE_URL: testUrl, RAMA_WORK_DIR: work, RAMA_MEMBER_NAME: MEMBER },
    ['/site/self', '/site/fixture'],
  );
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  if (process.env.RAMA_E2E_LOG) console.log(server?.output());
  await browser?.close();
  await server?.stop();
  source?.cleanup();
  if (work) rmSync(work, { recursive: true, force: true });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

/** Clicks a brick where the (deterministic) layout puts it, scaled to the canvas on screen. */
async function clickBrick(page: Page, bp: Blueprint, brick: string) {
  const box = layout(bp).byPath.get(brick)!;
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 60_000 });
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const sceneW = Number(await canvas.getAttribute('data-scene-width'));
  const sceneH = Number(await canvas.getAttribute('data-scene-height'));
  await page.mouse.click(
    rect.x + ((box.x + box.w / 2) * rect.width) / sceneW,
    rect.y + ((box.y + box.h / 2) * rect.height) / sceneH,
  );
}

describe('stage 2 e2e', () => {
  it('opens /site/self, clicks a brick, and reads its dependencies in English', async () => {
    const self = JSON.parse(
      readFileSync(new URL('../blueprint/self.json', import.meta.url), 'utf8'),
    ) as Blueprint;
    const brick = 'packages/blueprint/src/site.ts';
    const deps = self.edges.filter((e) => e.from === brick);
    expect(deps.length).toBeGreaterThan(3);

    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${server.browserUrl}/site/self`);
    await expect(page.locator('.mon h2').textContent()).resolves.toBe('Trust report');
    await clickBrick(page, self, brick);

    await page.locator('.mon h3', { hasText: brick }).waitFor();
    const section = page.locator('section[aria-label="Depends on"]');
    await expect(section.locator('b').first().textContent()).resolves.toBe(
      `Depends on (${deps.length})`,
    );
    for (const e of deps) {
      const row = section.locator(`[data-edge="${e.from}>${e.to}"]`);
      await expect(row.locator('.lnk').textContent()).resolves.toBe(e.to);
      const en = (await row.locator('.en').textContent())!;
      expect(en).toContain(e.english ? e.english.text : 'no English yet');
      expect(en).toMatch(
        e.english ? (e.english.confirmed ? /confirmed/ : /unconfirmed draft/) : /unknown/,
      );
    }
    await expect(page.locator('.reviewer').textContent()).resolves.toContain(
      `It needs ${deps.length} other bricks`,
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  it('confirms a drafted phrase on a cloned site: overlay written, Blueprint regenerated, audit_log appended', async () => {
    const bp = JSON.parse(
      readFileSync(path.join(work, 'fixture/blueprint.json'), 'utf8'),
    ) as Blueprint;
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.goto(`${server.browserUrl}/site/fixture`);
    await clickBrick(page, bp, 'lib/calc.ts');
    const row = page.locator(
      'section[aria-label="Depends on"] [data-edge="lib/calc.ts>lib/data.ts"]',
    );
    await expect(row.locator('.en').textContent()).resolves.toContain('the rows the app counts');
    await row
      .getByRole('button', { name: 'Confirm the phrase for lib/calc.ts → lib/data.ts' })
      .click();
    await row.locator('.pill', { hasText: /^confirmed$/ }).waitFor({ timeout: 30_000 });
    await expect(row.textContent()).resolves.toContain(`by ${MEMBER}`);

    const overlay = JSON.parse(
      readFileSync(path.join(work, 'fixture/repo/.rama/glossary.json'), 'utf8'),
    );
    expect(overlay['lib/data.ts#ROWS']).toMatchObject({
      text: 'the rows the app counts',
      confirmedBy: MEMBER,
    });
    const regenerated = JSON.parse(
      readFileSync(path.join(work, 'fixture/blueprint.json'), 'utf8'),
    ) as Blueprint;
    expect(regenerated.edges.find((e) => e.from === 'lib/calc.ts')!.english).toMatchObject({
      confirmed: true,
      by: MEMBER,
    });

    const sql = postgres(testUrl, { max: 1, onnotice: () => {} });
    const rows = await sql`select site_id, table_name, row_id, action, payload from audit_log`;
    await sql.end();
    expect(rows).toEqual([
      {
        site_id: 'fixture',
        table_name: '.rama/glossary.json',
        row_id: 'lib/data.ts#ROWS',
        action: 'confirm',
        payload: expect.objectContaining({ text: 'the rows the app counts' }),
      },
    ]);
    await page.close();
  });

  it('serves the Showroom and site office stubs, and 404 for an unknown site', async () => {
    for (const p of ['/site/self/showroom', '/site/self/discovery', '/site/fixture/showroom']) {
      expect((await fetch(`${server.url}${p}`)).status).toBe(200);
    }
    expect((await fetch(`${server.url}/site/nope`)).status).toBe(404);
  });
});
