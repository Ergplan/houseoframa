// Stage 11 end to end, in a real browser on the real dev server, with no command typed: a new product is
// built from the sample's cards by the recorded builder through the build loop; then the five tabs of the
// journey are walked with one lit action on each (a screenshot of each kept for the report), the
// recorded build is replayed on the Street, the Street is turned twice, Take an order is zoomed into down
// to its code, a change of it is typed in, every block's English is read and one confirmed by name, and
// the flow of the day's takings is shown: the real rows become the figure on the screen, and, since they
// leave the orders plot, the same flow runs along the Street's roads. Then the ground
// is opened: "open orders" dives into the plot, and the table fills the stage with its columns from the
// code and its rows from the product's own database, read-only, 50 at a time.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import postgres from 'postgres';
import { createDb, setSecret } from '@rama/db';
import { decide } from '../packages/ceremony/src/store.ts';
import { locateSite } from '../packages/blueprint/src/site.ts';
import { SAMPLE_CARDS, SAMPLE_IDEA, SAMPLE_NAME } from '../packages/workbench/src/sample.ts';
import { bannedIn } from '../apps/rama/test/banned.ts';
import { dropSandboxes, sandboxUrl } from '../packages/workbench/src/ground.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { clickGround } from './ground.ts';
import { throwawayDb } from './session.ts';

const MEMBER = 'Rachit Agarwal';
const RECORDING = path.resolve(import.meta.dirname, '../fixtures/sample-build');
// The report's screenshots are taken only when asked for (RAMA_SHOTS=1): the watcher's runs must not
// rewrite files in the repository.
const SHOTS =
  process.env.RAMA_SHOTS === '1'
    ? path.resolve(import.meta.dirname, '../docs/reports/stage-11')
    : null;
const SITE = 'chai-stall-test-drive';
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e11-'));
  db = await throwawayDb(MEMBER);
  server = await startDevServer(
    {
      RAMA_WORK_DIR: work,
      DATABASE_URL: db.url,
      AUTH_MODE: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GITHUB_TOKEN: '',
      RAMA_BUILDER_RECORDING: RECORDING,
      RAMA_VOICE: 'stand-in',
    },
    ['/login', '/', `/site/${SITE}`, `/site/${SITE}/discovery`, `/site/${SITE}/care`],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  // The product's own database, made by its photographs.
  if (db) await dropSandboxes({ ...process.env, DATABASE_URL: db.url });
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

const lit = (page: Page) => page.locator('.eg-btn--primary:visible').count();
const body = (page: Page) => page.locator('main').innerText();

describe('stage 11 e2e', () => {
  it('the journey, the camera, code written in the glass with English, and the flow of a figure', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(180_000);
    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(MEMBER) }).click();
    await page.locator('.whoami').waitFor();

    // A product, its cards said yes to, and the audit's key in Settings (so Call the audit can be lit).
    await page.goto(`${server.browserUrl}/`);
    await page.getByLabel('Name', { exact: true }).fill(SAMPLE_NAME);
    await page.getByLabel('The idea, in one line').fill(SAMPLE_IDEA);
    await page.getByRole('button', { name: 'Start the product' }).click();
    await page.waitForURL(new RegExp(`/site/${SITE}/discovery\\?`));
    const conn = createDb(db.url);
    try {
      const site = locateSite(SITE, { ...process.env, RAMA_WORK_DIR: work })!;
      for (const c of SAMPLE_CARDS.slice(1))
        await decide(
          conn.db,
          { id: SITE, repoDir: site.repoDir },
          {
            ...c,
            bricks: [],
            status: 'decided',
            by: MEMBER,
            at: new Date(),
            createdBy: 'rama:e2e@0',
          },
        );
      await setSecret(
        conn.db,
        'OPENAI_API_KEY',
        'sk-e2e-not-a-real-key',
        'rama:e2e@0',
        path.join(work, '.secret-key'),
      );
    } finally {
      await conn.close();
    }

    // Build: the one lit action is Start build; the recorded builder builds through the loop.
    const job = page.locator('.console [data-job="build"]');
    for (let tries = 0; ; tries++) {
      await page.goto(`${server.browserUrl}/site/${SITE}`);
      if (!(await job.count())) {
        expect(await lit(page)).toBe(1);
        await page.locator('.console').getByRole('button', { name: 'Start build' }).click();
        await page.waitForLoadState('load');
      }
      if (
        await job.waitFor({ timeout: 30_000 }).then(
          () => true,
          () => false,
        )
      )
        break;
      if (tries === 5) throw new Error('Start build was pressed six times and no build showed.');
    }
    // Attached, not visible: once the build ends its steps fold under their last sentence.
    await job.locator('[data-step="Built"]').waitFor({ state: 'attached', timeout: 900_000 });

    // The five tabs and Care: on each, only its own actions, at most one lit, and one on every act
    // that has a next thing to do; a screenshot of each at 1920×1080 for the report.
    if (SHOTS && !existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
    const tabs: [string, RegExp, number][] = [
      ['Idea', /\/discovery/, 1],
      ['Build', new RegExp(`/site/${SITE}$`), 1],
      ['Walk through', /\/walkthrough/, 1],
      ['Audit', /\/audit/, 1],
      ['Hand over', /\/handover/, 0],
      ['Care', /\/care/, 0],
    ];
    for (const [name, url, want] of tabs) {
      await page.getByRole('tab', { name }).click();
      await page.waitForURL(url);
      await page.locator(`.journey [aria-selected="true"]`).filter({ hasText: name }).waitFor();
      await page.waitForTimeout(800);
      expect(await lit(page), name).toBe(want);
      // The glossary holds on the tabs and their actions everywhere, and on the whole Street.
      expect(bannedIn(await page.locator('.journey').innerText()), name).toEqual([]);
      if (name === 'Build') expect(bannedIn(await body(page)), name).toEqual([]);
      if (SHOTS)
        await page.screenshot({
          path: path.join(SHOTS, `${name.toLowerCase().replace(/\s+/g, '-')}.png`),
        });
    }

    // The Street: the recorded build replayed lift by lift, then turned twice.
    await page.getByRole('tab', { name: 'Build' }).click();
    const street = page.locator('[data-level="street"] canvas[data-ready="true"]');
    await street.waitFor();
    // The replay runs lift by lift: seen past its second lift, then paused (under a busy machine a
    // whole replay can take minutes of slow frames; that it moves is what is checked here).
    await page.getByRole('button', { name: 'Play the building' }).click();
    await page
      .locator('.lake-live')
      .filter({ hasText: /^Lift [2-9]/ })
      .waitFor({ timeout: 300_000 });
    if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: /Turn right/ }).click();
    await page.getByRole('button', { name: /Turn right/ }).click();
    expect(
      await page
        .locator('[data-level="street"] canvas[data-orientation]')
        .getAttribute('data-orientation'),
    ).toBe('south');
    expect(new URL(page.url()).searchParams.get('o')).toBe('south');

    // Zoom into Take an order, down to its code.
    // Choose it in the folding panel over the picture, then come closer onto it.
    await page.locator('.lake-fold > summary').click();
    await page.locator('.lake-list [data-building="take-an-order"] .lake-name').click();
    await page.locator('[data-chosen="take-an-order"]').waitFor();
    for (let i = 0; i < 8 && !/[?&]b=take-an-order/.test(page.url()); i++) {
      await page.getByRole('button', { name: 'Closer' }).click();
      await page.waitForTimeout(150);
    }
    await page.waitForURL(/[?&]b=take-an-order/);
    await page.locator('[data-level="building"] canvas[data-ready="true"]').waitFor();
    for (let i = 0; i < 8 && !/at=code/.test(page.url()); i++) {
      await page.getByRole('button', { name: 'Closer' }).click();
      await page.waitForTimeout(150);
    }
    await page.waitForURL(/at=code/);

    // A file of it typed in, change by change; every block with its English; one confirmed by name.
    await page.goto(
      `${server.browserUrl}/site/${SITE}?at=code&b=take-an-order&brick=features%2Ftake-an-order%2Forder.ts`,
    );
    const pane = page.locator('[data-code-pane="features/take-an-order/order.ts"]');
    await pane.locator('.code-block').first().waitFor();
    await pane.getByLabel('Replay the file change by change').selectOption({ index: 1 });
    await pane
      .locator('[data-typing="true"]')
      .or(page.locator('[data-code-pane][data-typing="true"]'))
      .first()
      .waitFor();
    await page
      .locator('[data-code-pane][data-typing="false"] .code-block')
      .first()
      .waitFor({ timeout: 60_000 });
    await pane.getByLabel('Replay the file change by change').selectOption({ index: 0 });
    await pane.locator('.code-block').first().waitFor();
    const english = await pane
      .locator('.code-block')
      .evaluateAll((els) =>
        els.map((e) => [
          e.getAttribute('data-block'),
          e.querySelector('.code-block__english')?.getAttribute('data-explained'),
        ]),
      );
    expect(english.length).toBeGreaterThanOrEqual(3);
    for (const [kind, state] of english) expect([kind, state]).toEqual([kind, 'unconfirmed']);
    expect(
      bannedIn(
        await pane
          .locator('.code-block__english')
          .allInnerTexts()
          .then((t) => t.join(' ')),
      ),
    ).toEqual([]);
    await pane
      .getByRole('button', { name: `Confirm as ${MEMBER}` })
      .first()
      .click();
    await pane.getByText(`Confirmed by ${MEMBER}`).waitFor();
    // The inside: the same building from within, the file open in the panel beside it.
    await page.locator('[data-level="inside"] canvas[data-ready="true"]').waitFor();
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'inside.png') });
    // The code being written, seen inside the building: the lifts replayed, each change to its files
    // typed in over its brick.
    await page.goto(`${server.browserUrl}/site/${SITE}?at=code&b=take-an-order`);
    await page.locator('[data-level="inside"] canvas[data-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Play the lifts' }).click();
    await page.locator('canvas[data-typing]:not([data-typing=""])').waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'inside-typing.png') });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const site = locateSite(SITE, { ...process.env, RAMA_WORK_DIR: work })!;
    const overlay = JSON.parse(
      readFileSync(path.join(site.repoDir, '.rama/explanations.json'), 'utf8'),
    );
    expect(overlay.explanations.map((e: { by: string }) => e.by)).toEqual([MEMBER]);

    // The flow of the day's takings: the real rows leave, become the figure, arrive on the screen.
    await page.goto(
      `${server.browserUrl}/site/${SITE}?b=count-the-days-takings&figure=todays-total%2Ftodays-takings`,
    );
    await page.locator('[data-level="building"] canvas[data-ready="true"]').waitFor();
    await page.locator('[data-show-flow="todays-total/todays-takings"]').click();
    await page.locator('.flow-panel[data-step="3"]').waitFor({ timeout: 15_000 });
    const steps = await page.locator('.flow-steps li').allInnerTexts();
    // The rows come from the product's own database now: the stall wrote its sample day there.
    expect(steps[0]).toMatch(/^4 rows left orders table: Masala chai, cups 2, price paise 1500/);
    expect(steps.at(-1)).toBe('₹113.00 on the screen “Today’s total”.');
    expect(bannedIn(steps.join(' '))).toEqual([]);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'flow.png') });
    // Its trail crosses the Street (the rows leave the orders plot): followed along the roads.
    await page.locator('[data-flow-along]').click();
    await page.waitForURL(/\/site\/[^?]+\?flow=todays-total%2Ftodays-takings$/);
    await page.locator('[data-level="street"] canvas[data-ready="true"]').waitFor();
    await page
      .locator('[data-street-flow="todays-total/todays-takings"] .flow-panel[data-step="3"]')
      .waitFor({ timeout: 30_000 });
    expect(await page.locator('[data-street-flow] .flow-steps li').allInnerTexts()).toEqual(steps);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'street-flow.png') });
    // A figure worked out where its own input is kept stays inside one building, and says so.
    await page.goto(`${server.browserUrl}/site/${SITE}?flow=new-order%2Fnew-order-amount`);
    await page.locator('[data-street-flow-home="new-order/new-order-amount"]').waitFor();

    // The ground, opened: "open orders" from the Street, and the table fills the stage.
    await page.goto(`${server.browserUrl}/site/${SITE}`);
    await page.getByLabel('Say where to go').fill('open orders');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await page.waitForURL(/[?&]ground=orders/);
    const slab = page.locator('[data-level="ground"] canvas[data-ready="true"]');
    await slab.waitFor();
    expect(await page.locator('.eg-crumbs').innerText()).toMatch(
      /Street\s*›\s*the ground\s*›\s*orders$/,
    );
    // Its columns are the code's, and its rows the four of the sample day the stall wrote in itself.
    const heads = await page
      .locator('table[data-ground-table] th')
      .evaluateAll((ths) => ths.map((th) => th.getAttribute('data-name')));
    expect(heads).toEqual([
      'id',
      'site_id',
      'created_at',
      'created_by',
      'item',
      'cups',
      'price_paise',
      'taken_at',
    ]);
    expect(await page.locator('[data-count]').innerText()).toBe('4 orders today · 4 in all');
    expect(
      await page.locator('table[data-ground-table] tbody tr td:nth-child(4)').allInnerTexts(),
    ).toEqual(['sample', 'sample', 'sample', 'sample']);
    // Orders written into the product's own database by its own login, as the product writes them: the
    // slab shows them as the table holds them, newest first, 50 at a time.
    const own = postgres(
      sandboxUrl(SITE, { ...process.env, DATABASE_URL: db.url, RAMA_WORK_DIR: work }),
      {
        max: 1,
        onnotice: () => {},
      },
    );
    try {
      for (let i = 1; i <= 60; i++)
        await own`insert into orders (site_id, created_by, item, cups, price_paise, taken_at, created_at)
          values (${SITE}, 'the product', ${`Order ${i}`}, ${(i % 3) + 1}, 1500, now(), now() - ${`${60 - i} seconds`}::interval)`;
    } finally {
      await own.end();
    }
    await page.reload();
    await slab.waitFor();
    expect(await page.locator('[data-count]').innerText()).toBe('64 orders today · 64 in all');
    const items = () =>
      page.locator('table[data-ground-table] tbody tr td:nth-child(5)').allInnerTexts();
    expect((await items()).slice(0, 2)).toEqual(['Order 60', 'Order 59']);
    expect(await items()).toHaveLength(50);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ground.png') });
    await page.locator('[data-more]').click();
    await page.getByText('Rows 51–64').waitFor();
    expect((await items()).slice(0, 10)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Order ${10 - i}`),
    );
    expect((await items()).slice(10).sort()).toEqual([
      'Ginger chai',
      'Lemon tea',
      'Masala chai',
      'Masala chai',
    ]);
    // A column a figure is worked out from is marked, and its card leads to that figure's flow.
    expect(await page.locator('th[data-name="cups"]').getAttribute('data-figure')).toBe('yes');
    await clickGround(page, -1, heads.indexOf('cups'));
    const card = page.locator('[data-card="column:cups"]');
    await card.waitFor();
    expect(await card.innerText()).toMatch(/Order amount/);
    // Turned, the table stays on the face toward the camera.
    await slab.focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-level="ground"] canvas[data-orientation="east"]').waitFor();
    await card.locator('[data-flow-link]').first().click();
    await page.waitForURL(/[?&]flow=/);
    await page.locator('.flow-panel').waitFor({ timeout: 30_000 });
  }, 1_500_000);
});
