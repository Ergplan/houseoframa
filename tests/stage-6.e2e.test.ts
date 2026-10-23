// Stage 6 end to end, on a real target (the house-convention fixture app, built and photographed): a
// member signs in through the real link flow (the link read from the server's outbox), books a pod,
// opens it and gets the site's triptych, signs the site's screens in the walkthrough, and the pod's
// light, read as the pod controller reads it, moves amber → blue, then green once a clean audit is on file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { audits, createDb, modelCalls, pods } from '@rama/db';
import { addSite } from '../packages/blueprint/src/site.ts';
import { capture } from '../packages/trace/src/capture.ts';
import { captureDir } from '../packages/trace/src/showroom.ts';
import { fixtureApp } from '../packages/trace/test/fixture-app.ts';
import type { FixtureRepo } from '../packages/blueprint/test/fixture-repo.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { signIn, throwawayDb } from './session.ts';

const POD_TOKEN = 'pod-controller-e2e';
let app: FixtureRepo;
let work: string;
let db: Awaited<ReturnType<typeof throwawayDb>>;
let server: DevServer;
let browser: Browser;
let commit: string;

beforeAll(async () => {
  app = fixtureApp();
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e6-'));
  const env = { ...process.env, RAMA_WORK_DIR: work };
  const { site, blueprint } = addSite(app.dir, { id: 'shop', name: 'Shop', env });
  commit = blueprint.commit;
  await capture(site, blueprint, { outDir: captureDir('shop', env) });
  db = await throwawayDb('Asha Rao');
  // Asha has an email and owns the site; she will sign in by link in the browser, not with this token.
  await signIn(db.url, { name: 'Asha Rao', email: 'asha@example.com' }, [
    { id: 'shop', name: 'Shop', repo: app.dir },
  ]);
  const conn = createDb(db.url);
  await conn.db.insert(pods).values({ pod: 1, name: 'Prototype pod', createdBy: 'rama:e2e@0' });
  await conn.close();
  server = await startDevServer(
    { RAMA_WORK_DIR: work, DATABASE_URL: db.url, RAMA_POD_TOKEN: POD_TOKEN },
    ['/login', '/book', '/pod/1', '/site/shop/walkthrough'],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  app?.cleanup();
  if (work) rmSync(work, { recursive: true, force: true });
});

const light = async () => {
  const r = await fetch(`${server.url}/api/pod/1/status`, {
    headers: { authorization: `Bearer ${POD_TOKEN}` },
  });
  return ((await r.json()) as { light: string }).light;
};

/** Signs in the real way: asks for a link, reads it from the server's outbox, follows it. */
async function signInByLink(page: Page) {
  await page.goto(`${server.browserUrl}/login`);
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.getByRole('status').waitFor();
  let link: string | undefined;
  await expect
    .poll(
      () =>
        (link =
          /\[outbox\] to asha@example\.com[^\n]*\n[\s\S]*?(http\S+\/auth\/verify\?token=\S+)/.exec(
            server.output(),
          )?.[1]),
      { timeout: 30_000 },
    )
    .toBeTruthy();
  await page.goto(link!.replace(/^https?:\/\/[^/]+/, server.browserUrl));
  await page.getByText('Signed in as').waitFor();
}

describe('stage 6 e2e', () => {
  it('a member signs in, books a pod, opens the triptych, signs the screens, and the pod light changes', async () => {
    expect(await light()).toBe('off');
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.slice(0, 200)}`));
    try {
      await signInByLink(page);

      // Book pod 1 for work on the site, from now: the pod opens with the site's triptych.
      await page.goto(`${server.browserUrl}/book`);
      await page.getByLabel('Site').selectOption('shop');
      await page.getByRole('button', { name: 'Book for work on this site, from now' }).click();
      await page.waitForURL(/\/pod\/1$/);
      await expect(page.locator('.triptych iframe').count()).resolves.toBe(3);
      await expect(page.locator('.triptych-banner').textContent()).resolves.toContain(
        'Pod 1 · Shop',
      );
      expect(await page.locator('iframe[data-pane="site"]').getAttribute('src')).toBe('/site/shop');
      // Photographed at the current commit and not signed: awaiting sign-off.
      expect(await light()).toBe('amber');

      // Sign each screen in the walkthrough, under her own name.
      await page.goto(`${server.browserUrl}/site/shop/walkthrough`);
      for (const screen of ['/', '/orders/[id]']) {
        await page
          .locator('.strip button')
          .filter({ hasText: new RegExp(`${screen.replace(/[[\]/]/g, '\\$&')}$`) })
          .first()
          .click();
        const mon = page.locator(`aside.mon[data-screen="${screen}"]`);
        await mon.waitFor();
        await mon.getByRole('button', { name: 'Confirm and sign as Asha Rao' }).click();
        await mon.locator('[data-state="signed"]').waitFor({ timeout: 30_000 });
      }
      // Every screen signed, no audit yet: back to work (blue), not green.
      expect(await light()).toBe('blue');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }

    // A clean audit of this commit on file: signed and audited, green.
    const conn = createDb(db.url);
    try {
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
          input: {},
          status: 'ok',
          attempts: 1,
          ms: 1,
          createdBy: 'rama:audit@0.1.0',
        })
        .returning();
      await conn.db.insert(audits).values({
        siteId: 'shop',
        commit,
        vendor: 'openai',
        model: 'gpt-e2e',
        callId: call!.id,
        inputsHash: 'h',
        at: new Date(),
        report: { counts: { defects: 0, notes: 0, passes: 1, bricks: 1 } },
        createdBy: 'rama:audit@0.1.0',
      });
    } finally {
      await conn.close();
    }
    expect(await light()).toBe('green');
  });
});
