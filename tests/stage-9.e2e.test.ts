// Stage 9 end to end, in a real browser on the real dev server, with no command typed: the trainer
// chooses the brains in Settings (the auditor list leaves out the builder's company), starts a new
// product from an empty repository, answers "Which brains will build, check and speak?" in discovery,
// and presses Start build. The builder (the recording of a real Claude Code build, so no vendor is paid)
// builds it lift by lift on the house stack; House of Rama checks each lift by itself; and the Street
// ends fully traced, every screen Verified, named as the cards name it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createDb } from '@rama/db';
import { decide } from '../packages/ceremony/src/store.ts';
import { locateSite } from '../packages/blueprint/src/site.ts';
import { SAMPLE_CARDS, SAMPLE_IDEA, SAMPLE_NAME } from '../packages/workbench/src/sample.ts';
import { bannedIn } from '../apps/rama/test/banned.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { throwawayDb } from './session.ts';

const MEMBER = 'Rachit Agarwal';
const RECORDING = path.resolve(import.meta.dirname, '../fixtures/sample-build');
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e9-'));
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
    },
    ['/login', '/', '/settings', '/site/chai-stall-test-drive'],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('stage 9 e2e', () => {
  it('brains in Settings, a new product, its brains asked, Start build: a fully traced Street', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(180_000);
    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(MEMBER) }).click();
    await page.locator('.whoami').waitFor();

    // Settings → Brains: choosing a builder takes its company off the auditor list.
    await page.goto(`${server.browserUrl}/settings`);
    const brains = page.locator('#brains [data-brains]');
    const auditors = () =>
      brains
        .locator('select[name="auditor.vendor"] option')
        .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    await brains.locator('select[name="builder.builder"]').selectOption('codex');
    expect(await auditors()).not.toContain('openai');
    expect(await brains.locator('[data-unwired]').innerText()).toMatch(/Codex is not wired/);
    await brains.locator('select[name="builder.builder"]').selectOption('claude-code');
    expect(await auditors()).not.toContain('anthropic');
    expect(await auditors()).toContain('openai');
    await brains.locator('select[name="auditor.vendor"]').selectOption('openai');
    await brains.locator('input[name="auditor.model"]').fill('gpt-6.1-sol');
    await brains.getByRole('button', { name: 'Save the brains' }).click();
    await page.waitForURL(/\/settings\?said=/);
    expect(new URL(page.url()).searchParams.get('said')).toBe(
      'The brains are saved: every new product starts with them.',
    );

    // A new product from an empty repository.
    await page.goto(`${server.browserUrl}/`);
    await page.getByLabel('Name').fill(SAMPLE_NAME);
    await page.getByLabel('The idea, in one line').fill(SAMPLE_IDEA);
    await page.getByRole('button', { name: 'Start the product' }).click();
    await page.waitForURL(/\/site\/chai-stall-test-drive\?/);
    const siteId = 'chai-stall-test-drive';

    // Discovery asks for the brains; the answer is a card decided by the member.
    await page.goto(`${server.browserUrl}/site/${siteId}/discovery`);
    const ask = page.locator('[data-brains-ask]');
    expect(await ask.locator('h2').innerText()).toBe('Which brains will build, check and speak?');
    await ask.getByRole('button', { name: 'Yes, these brains' }).click();
    await page.waitForURL(/discovery\?said=/);
    expect(await page.locator('[data-brains-ask]').getAttribute('data-brains-ask')).toBe('product');

    // The rest of the brief, said yes to (discovery by voice is Stage 10's).
    const conn = createDb(db.url);
    try {
      const site = locateSite(siteId, { ...process.env, RAMA_WORK_DIR: work })!;
      for (const c of SAMPLE_CARDS.slice(1))
        await decide(
          conn.db,
          { id: siteId, repoDir: site.repoDir },
          {
            ...c,
            bricks: [],
            status: 'decided',
            by: MEMBER,
            at: new Date(),
            createdBy: 'rama:e2e@0',
          },
        );
    } finally {
      await conn.close();
    }

    // Start build, from the trainer console; the lifts show there as each is checked.
    // The build shows in the console, which refreshes itself while it runs. Under a full test suite
    // the dev server reloads the page when other servers write beside it, and a press can be lost in
    // a reload: press again until the build shows (a press while it runs returns the same build).
    const job = page.locator('.console [data-job="build"]');
    for (let tries = 0; ; tries++) {
      await page.goto(`${server.browserUrl}/site/${siteId}`);
      if (!(await job.count())) {
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
      if (tries === 5) {
        // What the server and the console said, for the failure's record.
        console.error(server.output().slice(-6000));
        console.error(
          await page
            .locator('.console')
            .innerText()
            .catch(() => 'no console'),
        );
        throw new Error('Start build was pressed six times and no build showed in the console.');
      }
    }
    await job.locator('[data-step="Built"]').waitFor({ timeout: 900_000 });
    const steps = await job
      .locator('[data-step]')
      .evaluateAll((els) =>
        els.map((e) => [e.getAttribute('data-step'), e.className.includes('pass')]),
      );
    expect(steps).toEqual([
      ['Lift 0: the house stack', true],
      ['Lift 1', false],
      ['Lift 2', true],
      ['Lift 3', true],
      ['Lift 4', true],
      ['Built', true],
    ]);
    // The grey flag says what was wrong and what the builder does next.
    expect(await job.locator('[data-step="Lift 1"] .next').innerText()).toBe(
      'Next: The builder fixes this in the next lift.',
    );

    // The Street, refreshed by itself: three buildings in the cards' words, every figure traced,
    // every screen Verified before anyone signs.
    await page.goto(`${server.browserUrl}/site/${siteId}`);
    await page.locator('[data-level="street"] canvas[data-ready="true"]').waitFor();
    const names = await page.locator('.lake-list [data-building] .lake-name').allTextContents();
    expect(names.slice(0, 3)).toEqual([
      'See today’s orders',
      'Take an order',
      'Count the day’s takings',
    ]);
    const flags = await page.locator('.lake-list [data-building] [data-state]').allTextContents();
    expect(flags.slice(0, 3)).toEqual(['Verified', 'Verified', 'Verified']);
    await expect(
      page.locator('.console [data-tally] [data-state]').allTextContents(),
    ).resolves.toEqual(['3 Verified', '0 Confirmed', '0 Unverified']);
    expect(await page.locator('.console').innerText()).toContain(
      '8 of 8 figures on the screens traced.',
    );
    expect(bannedIn(await page.locator('body').innerText())).toEqual([]);
    // A build of five lifts, each built and photographed: up to twenty minutes on a busy machine.
  }, 1_200_000);
});
