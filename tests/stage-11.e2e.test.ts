// Stage 11 end to end, in a real browser on the real dev server, with no command typed: a new product is
// built from the sample's cards by the recorded builder through the build loop; then the five tabs of the
// journey are walked with one lit action on each (a screenshot of each kept for the report), the
// recorded build is replayed on the Street, the Street is turned twice, Take an order is zoomed into down
// to its code, a change of it is typed in, every block's English is read and one confirmed by name, and
// the flow of the day's takings is shown: the real rows become the figure on the screen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createDb, setSecret } from '@rama/db';
import { decide } from '../packages/ceremony/src/store.ts';
import { locateSite } from '../packages/blueprint/src/site.ts';
import { SAMPLE_CARDS, SAMPLE_IDEA, SAMPLE_NAME } from '../packages/workbench/src/sample.ts';
import { bannedIn } from '../apps/rama/test/banned.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
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
    await page.getByLabel('Name').fill(SAMPLE_NAME);
    await page.getByLabel('The idea, in one line').fill(SAMPLE_IDEA);
    await page.getByRole('button', { name: 'Start the product' }).click();
    await page.waitForURL(new RegExp(`/site/${SITE}\\?`));
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
    expect(steps[0]).toMatch(
      /^4 rows left data\/orders\.json: Masala chai, cups 2, price of cup 1500/,
    );
    expect(steps.at(-1)).toBe('₹113.00 on the screen “Today’s total”.');
    expect(bannedIn(steps.join(' '))).toEqual([]);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'flow.png') });
  }, 1_500_000);
});
