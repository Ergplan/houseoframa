// Stage 8 end to end, in a real browser on the real dev server: the sample product (photographed, its
// tests run, audited by the Test drive stand-in) opens on its Street. Every building's name is read from
// the Street; no developer word is on the page at the Street or Building level; the facades carry the
// real screens; a click chooses a building and a second click opens it; a figure opens its trail; "show
// me the code" reaches the code; and the audit's drones fly the Street, leaving their badges.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createDb } from '@rama/db';
import { buildingFaces, type Street } from '@rama/stage';
import { callAudit, runSiteTests, siteLakefront } from '../packages/workbench/src/index.ts';
import { bannedIn } from '../apps/rama/test/banned.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { sampleSite } from './sample.ts';
import { signIn, throwawayDb } from './session.ts';

const MEMBER = 'Rachit Agarwal';
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;
let street: Street;
let flagWords: string[];

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e8-'));
  db = await throwawayDb(MEMBER);
  const env = { ...process.env, RAMA_WORK_DIR: work, DATABASE_URL: db.url, OPENAI_API_KEY: '' };
  const { site, blueprint } = await sampleSite(work, 'chai');
  await signIn(db.url, { name: MEMBER }, [{ id: 'chai', name: 'Chai Stall', repo: site.repoDir }]);
  await runSiteTests(site, env);
  const conn = createDb(db.url);
  try {
    await callAudit(conn.db, site, { standIn: true, env });
  } finally {
    await conn.close();
  }
  const lf = siteLakefront(site, blueprint, env);
  street = lf.street;
  flagWords = street.buildings.map((b) => lf.flags[b.id]!.state);
  server = await startDevServer(
    { RAMA_WORK_DIR: work, DATABASE_URL: db.url, AUTH_MODE: '', OPENAI_API_KEY: '' },
    ['/login', '/site/chai'],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

/** The text a person reads on the page, the breadcrumb and the trainer console included. */
const readable = async (page: Page) =>
  [
    await page.locator('body').innerText(),
    ...(await page
      .locator('[aria-label], [placeholder], [title]')
      .evaluateAll((els) =>
        els.map((e) =>
          ['aria-label', 'placeholder', 'title'].map((a) => e.getAttribute(a) ?? '').join(' '),
        ),
      )),
  ].join('\n');

/** Clicks the picture at a point of the Street, scaled to the canvas as the page shows it. */
async function clickStreet(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas[data-ready="true"]');
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: (x * box.width) / street.width, y: (y * box.height) / street.height },
  });
}

describe('stage 8 e2e', () => {
  it('the member names every building of the sample product from the Street, and walks in to the code', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.slice(0, 200)}`));

    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(MEMBER) }).click();
    await page.locator('.whoami').waitFor();

    // The Street: every building by name and what it does, in the owner's words.
    expect((await page.goto(`${server.browserUrl}/site/chai`))!.status()).toBe(200);
    await page.locator('[data-level="street"] canvas[data-ready="true"]').waitFor();
    const names = await page.locator('.lake-list [data-building] .lake-name').allTextContents();
    expect(names).toEqual([
      'See today’s orders',
      'Take an order',
      'Count the day’s takings',
      'Shared by several',
      'Behind the screens',
    ]);
    const does = await page.locator('.lake-list [data-building] .lake-does').allTextContents();
    expect(does.slice(0, 3)).toEqual([
      'Lists every order the stall has taken today, what each one costs, and how many there are.',
      'Writes down a new order and shows what it will cost before it is saved.',
      'Adds up everything the stall took today and the GST owed on it.',
    ]);
    expect(await page.locator('.eg-crumbs').innerText()).toMatch(/Chai Stall\s*›\s*Street$/);
    // Each building's flag says its word, as metrics buildingState gives it from the screens' states.
    const flags = await page.locator('.lake-list [data-building] [data-state]').allTextContents();
    expect(flags).toEqual(flagWords);
    expect(flags).toContain('Verified');
    // The facades carry the real screens, once their pictures are in.
    await page.locator('canvas[data-facades="3"]').waitFor();
    expect(bannedIn(await readable(page))).toEqual([]);

    // A click on a building chooses it; a second click goes in.
    const take = street.buildings.find((b) => b.id === 'take-an-order')!;
    const top = buildingFaces(street, take).top;
    const mid = {
      x: top.reduce((s, q) => s + q.x, 0) / 4,
      y: top.reduce((s, q) => s + q.y, 0) / 4,
    };
    await clickStreet(page, mid.x, mid.y);
    await page.locator('.lake-chosen[data-chosen="take-an-order"]').waitFor();
    await clickStreet(page, mid.x, mid.y);
    await page.waitForURL(/\?b=take-an-order$/);

    // The Building level: the screen on its front, its figure, the trail in plain words.
    await page.locator('[data-level="building"] canvas[data-ready="true"]').waitFor();
    expect(await page.locator('.eg-crumbs').innerText()).toMatch(/Street\s*›\s*Take an order$/);
    await page.locator('.lake-figures [data-figure]').first().click();
    const trail = page.locator('[data-trail]');
    await trail.waitFor();
    expect(await trail.innerText()).toContain('How it is worked out.');
    expect(await page.locator('.eg-folder').count()).toBe(1);
    expect(bannedIn(await readable(page))).toEqual([]);

    // "Show me the code", in words: the inside of the building, with it in the breadcrumb.
    await page.getByLabel('Say where to go').fill('show me the code');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await page.waitForURL(/at=code&b=take-an-order/);
    await page.locator('[data-level="inside"] canvas[data-ready="true"]').waitFor();
    expect(await page.locator('.eg-crumbs').innerText()).toMatch(
      /Street\s*›\s*Take an order\s*›\s*inside$/,
    );

    // Back on the Street, the audit: the drones fly building by building and their badges stay.
    await page.locator('.eg-crumbs').getByRole('link', { name: 'Street' }).click();
    await page.locator('[data-level="street"] canvas[data-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Fly the audit' }).click();
    await page.locator('canvas[data-drones="flying"]').waitFor();
    await page.locator('.lake-log li').nth(2).waitFor();
    await page.getByRole('button', { name: 'Skip to the end' }).click();
    await page.locator('canvas[data-drones="done"]').waitFor();
    expect(await page.locator('.lake-list [data-badge]').count()).toBe(5);
    expect(await page.locator('.lake-log').innerText()).toContain('Verdict');
    // The auditor's narration is its drafted words, marked unconfirmed until a person confirms it.
    expect(await page.locator('[data-narration] [data-draft="unconfirmed"]').count()).toBe(1);
    expect(bannedIn(await readable(page))).toEqual([]);
    expect(errors).toEqual([]);
  }, 600_000);
});
