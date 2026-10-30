// Stage 13 end to end, in a real browser on the real dev server, with no command typed: a customer alone
// in the chair. Their home is the arena; Test drive builds the sample product (the recording of a real
// Claude Code build, so no vendor is paid) and ends with "Watch the film of the build". The film plays
// the real build: the plan from the cards said yes to, the design read before a block, the foundation
// laid block by block in plain words, the build with the builder's own words and each file typed in, the
// grey flag where the gate stopped the first lift, the product's own code run on its data, the ground's
// real rows with who may write them, and the screens with their sealed signatures. A customer is never
// shown the trainer's lakefront; the glossary's banned words never appear outside the code itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { bannedIn } from '../apps/rama/test/banned.ts';
import { dropSandboxes } from '../packages/workbench/src/ground.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { throwawayDb } from './session.ts';

const CUSTOMER = 'Test drive';
const RECORDING = path.resolve(import.meta.dirname, '../fixtures/sample-build');
const SHOTS =
  process.env.RAMA_SHOTS === '1'
    ? path.resolve(import.meta.dirname, '../docs/reports/stage-13')
    : null;
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e13-'));
  db = await throwawayDb('Rachit Agarwal');
  server = await startDevServer(
    {
      RAMA_WORK_DIR: work,
      DATABASE_URL: db.url,
      AUTH_MODE: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GITHUB_TOKEN: '',
      RAMA_BUILDER_RECORDING: RECORDING,
      RAMA_TESTDRIVE_BUILDER: 'recorded',
      RAMA_VOICE: 'stand-in',
    },
    ['/login', '/', '/testdrive', '/film/testdrive-1'],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  if (db) await dropSandboxes({ ...process.env, DATABASE_URL: db.url });
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

/** What a person reads, without the lines of code typed in the code pane. */
const words = (page: Page) =>
  page.locator('body').evaluate((b) => {
    const code = [
      ...b.querySelectorAll<HTMLElement>('.film-code pre, .film-path, .film-part b, .film-card h4'),
    ];
    code.forEach((e) => (e.style.display = 'none'));
    const t = (b as HTMLElement).innerText;
    code.forEach((e) => (e.style.display = ''));
    return t;
  });
/**
 * The look of every scene (design/film): the journey's tabs, the voice at the foot, the picture taking
 * most of the width, and never more than one lit action on the screen.
 */
const looksRight = async (page: Page) => {
  expect(await page.locator('.film-tabs .film-tab').count()).toBe(7);
  expect(await page.locator('.film-voice').isVisible()).toBe(true);
  expect(await page.locator('.film-btn.lit:visible').count()).toBeLessThanOrEqual(1);
  const canvases = page.locator('.film-canvas:visible');
  if (await canvases.count())
    expect((await canvases.first().boundingBox())!.width).toBeGreaterThan(1920 * 0.4);
};
const shot = async (page: Page, name: string) => {
  await looksRight(page);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

describe('stage 13 e2e', () => {
  it('a customer alone: the arena, Test drive, and the film of the real build from plan to signatures', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(240_000);
    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(CUSTOMER) }).click();
    await page.locator('.whoami').waitFor();

    // The arena: one sentence and one lit action.
    await page.goto(`${server.browserUrl}/`);
    await expect(
      page.getByRole('heading', { name: /What shall we make/ }).isVisible(),
    ).resolves.toBe(true);
    expect(await page.locator('.film-btn.lit:visible').count()).toBe(1);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'arena.png') });

    // Test drive builds the sample, then offers its film.
    await page.goto(`${server.browserUrl}/testdrive`);
    await page.getByRole('button', { name: 'Test drive' }).click();
    const watch = page.getByRole('link', { name: 'Watch the film of the build' });
    await watch.waitFor({ timeout: 600_000 });
    await watch.click();
    await page.waitForURL(/\/film\/testdrive-1/);
    expect(
      readFileSync(path.join(work, 'testdrive-1', 'lifts.jsonl'), 'utf8')
        .trim()
        .split('\n'),
    ).toHaveLength(4);

    // A customer is never shown the trainer's lakefront.
    await page.goto(`${server.browserUrl}/site/testdrive-1`);
    await page.waitForURL(/\/film\/testdrive-1/);
    expect(await page.getByRole('link', { name: 'Trainer view' }).count()).toBe(0);

    // The plan: the seven cards said yes to, by name.
    await page.goto(`${server.browserUrl}/film/testdrive-1?scene=plan`);
    await page.locator('.film-step').first().waitFor();
    expect(await page.locator('.film-step').count()).toBe(7);
    expect(await page.locator('.film-step .film-chip.ok').count()).toBe(7);
    expect(bannedIn(await words(page))).toEqual([]);
    await shot(page, 'plan');

    // The design, read before a block: six beats, the ground's one table named.
    await page.locator('.film-tab', { hasText: 'The design' }).click();
    expect(await page.locator('.film-beat').count()).toBe(6);
    expect(
      await page.locator('.film-beat', { hasText: 'The ground is the database' }).innerText(),
    ).toMatch(/orders/);
    expect(bannedIn(await words(page))).toEqual([]);
    await shot(page, 'design');

    // The foundation: every block of the house stack named in plain words, laid in order.
    await page.locator('.film-tab', { hasText: 'The foundation' }).click();
    const laid = page.locator('.film-laid-b');
    expect(await laid.count()).toBeGreaterThan(15);
    expect(await laid.first().innerText()).toMatch(/The pipe to the ground/);
    await page.waitForTimeout(3000);
    expect(await page.locator('.film-folder h3').innerText()).not.toBe('');
    await shot(page, 'foundation');

    // The build: the builder's own words, each file typed in, and the grey flag where the gate stopped it.
    await page.locator('.film-tab', { hasText: 'The build' }).click();
    await page
      .locator('.film-subs p')
      .filter({ hasText: /first page now lists/ })
      .waitFor();
    expect(await page.locator('.film-subs small').first().innerText()).toMatch(/its own words/);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Faster' }).click();
    await page.locator('.film-code pre .ln').first().waitFor();
    await shot(page, 'build');
    await page.locator('.film-flag').waitFor({ timeout: 300_000 });
    expect(await page.locator('.film-flag').innerText()).toMatch(
      /The merge gate refuses the screen/,
    );
    await shot(page, 'flag');
    await page.getByRole('button', { name: 'Watch the fix' }).click();
    await page
      .locator('.film-subs p')
      .filter({ hasText: /I added tests/ })
      .waitFor();

    // Try it: the product's own code run on its own data, every step with its value.
    await page.locator('.film-tab', { hasText: 'Try it' }).click();
    await page.locator('.film-trace').first().waitFor();
    expect(await page.locator('.film-runhead').innerText()).toMatch(
      /the product, not the Builder/i,
    );
    const trace = await page.locator('.film-trace').allInnerTexts();
    expect(trace.length).toBeGreaterThan(1);
    expect(trace.join('\n')).not.toMatch(/dry: no value/);
    await shot(page, 'try');

    // The ground: what a database is, the real rows, who writes and who only reads.
    await page.locator('.film-tab', { hasText: 'The ground' }).click();
    await page
      .locator('.film-slab .ttl span')
      .filter({ hasText: /orders/ })
      .waitFor();
    expect(await page.locator('.film-grid .cell:not(.h)').count()).toBeGreaterThan(0);
    expect(await page.locator('.film-matrix').innerText()).toMatch(/writes/);
    await shot(page, 'ground');

    // The walk through: the real screens with their figures traced, and the signatures sealed.
    await page.locator('.film-tab', { hasText: 'Walk through' }).click();
    expect(await page.locator('.film-shot img').count()).toBe(3);
    expect(await page.locator('.film-sig.signed').count()).toBe(2);
    expect(await page.locator('.film-seal').count()).toBe(2);
    expect(bannedIn(await words(page))).toEqual([]);
    await shot(page, 'walk');
  }, 1_200_000);
});
