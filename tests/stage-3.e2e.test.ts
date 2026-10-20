// Stage 3 end to end, in a real browser on the real dev server: a target that follows the house
// convention (packages/trace/test/fixture-app.ts) is added as a site, its real screens are captured
// with Playwright from its running app, and in the Showroom a click on a traced figure's hotspot opens
// its trail, whose formula is read. The untraced amount on the same screen is outlined as untraced.
// Everything runs in a temporary work dir, so nothing is written into this repository.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { addSite } from '../packages/blueprint/src/site.ts';
import { capture } from '../packages/trace/src/capture.ts';
import { captureDir } from '../packages/trace/src/showroom.ts';
import { fixtureApp } from '../packages/trace/test/fixture-app.ts';
import type { FixtureRepo } from '../packages/blueprint/test/fixture-repo.ts';
import { startDevServer, type DevServer } from './dev-server.ts';

let work: string;
let app: FixtureRepo;
let server: DevServer;
let browser: Browser;

beforeAll(async () => {
  app = fixtureApp();
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e3-'));
  const env = { ...process.env, RAMA_WORK_DIR: work };
  const { site, blueprint } = addSite(app.dir, { id: 'shop', name: 'Shop', env });
  await capture(site, blueprint, { outDir: captureDir('shop', env) });
  server = await startDevServer({ RAMA_WORK_DIR: work }, ['/site/shop/showroom']);
  browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  app?.cleanup();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('stage 3 e2e', () => {
  it("opens the Showroom, clicks a traced figure's hotspot, and reads its formula", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${server.browserUrl}/site/shop/showroom`);
    await page.locator('.lede b', { hasText: '3 of 10' }).waitFor({ timeout: 60_000 });

    // The real screenshot is served and loaded.
    const img = page.locator('.shotwrap img');
    await expect
      .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
      .toBe(390);

    // The untraced amount is outlined as untraced, and says so when clicked.
    const untraced = page.locator('.hot.untraced');
    await expect(untraced.getAttribute('aria-label')).resolves.toBe('Untraced figure ₹99');

    // Click the traced hotspot (once React is live) and read the trail's formula.
    const hot = page.locator('.hot[data-figure="order-total"]');
    await expect
      .poll(
        async () => {
          await hot.click();
          return page.locator('.trail[data-figure="order-total"]').count();
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    const formula = page.locator('section[aria-label="Formula"]');
    await expect(formula.locator('p').first().textContent()).resolves.toBe(
      'For each line, quantity times price; added up.',
    );
    await expect(formula.locator('pre').textContent()).resolves.toContain(
      'export function orderTotal(lines) {',
    );
    await expect(formula.locator('.where').textContent()).resolves.toBe('lib/total.js:2');
    await expect(page.locator('.trail .check').textContent()).resolves.toMatch(
      /Re-executed: matches the screen\. Shown 2800, computed by the target's own code 2800\./,
    );

    await untraced.click();
    await page.locator('.trail[data-figure="untraced"]').waitFor();
    expect(errors).toEqual([]);
    await page.close();
  });
});
