// Stage 7 end to end, in a real browser on the real dev server, with no terminal: a person opens the app,
// picks their name, enters the GitHub token in Settings (a stub GitHub, so nothing leaves the machine)
// and the account to create products under, starts a product and gets its repository with the work in
// it, and runs Test drive to a pass. No vendor key is set anywhere; the token never reaches a log or a
// file in the clear.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { startDevServer, type DevServer } from './dev-server.ts';
import { throwawayDb } from './session.ts';

const TOKEN = 'ghp_E2eTokenNeverToBeSeenAgain0001';
let work: string;
let server: DevServer;
let browser: Browser;
let github: Server;
let db: Awaited<ReturnType<typeof throwawayDb>>;

/** A GitHub that knows one token and makes each repository a bare repository in the work dir. */
function stubGitHub(): Promise<string> {
  github = createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`)
      return json(401, { message: 'Bad credentials' });
    if (req.method === 'GET' && req.url === '/user') return json(200, { login: 'e2e-bot' });
    const m = /^\/orgs\/([^/]+)\/repos$/.exec(req.url ?? '');
    if (req.method === 'POST' && m) {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const { name } = JSON.parse(body) as { name: string };
        const bare = path.join(work, 'github', m[1]!, `${name}.git`);
        execFileSync('git', ['init', '--quiet', '--bare', bare]);
        json(201, {
          full_name: `${m[1]}/${name}`,
          html_url: `https://github.com/${m[1]}/${name}`,
          clone_url: bare,
        });
      });
      return;
    }
    json(404, {});
  });
  return new Promise((resolve) =>
    github.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(github.address() as AddressInfo).port}`),
    ),
  );
}

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e7-'));
  const api = await stubGitHub();
  db = await throwawayDb('Rachit Agarwal');
  server = await startDevServer(
    {
      RAMA_WORK_DIR: work,
      DATABASE_URL: db.url,
      RAMA_GITHUB_API: api,
      AUTH_MODE: '',
      // No key in the environment: everything is entered on screen, or not at all.
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GITHUB_TOKEN: '',
      RAMA_SIGNING_KEY: '',
    },
    ['/login', '/', '/settings', '/testdrive'],
  );
  browser = await chromium.launch();
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  github?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe('stage 7 e2e', () => {
  it('no terminal: pick a name, enter keys, start a product with its repository, Test drive to green', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1300, height: 900 } })
    ).newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.slice(0, 200)}`));

    // Who are you? The names come from members.json.
    await page.goto(`${server.browserUrl}/`);
    await page.getByRole('link', { name: 'Who are you?' }).click();
    await page.getByRole('heading', { name: 'Who are you?' }).waitFor();
    await page.getByRole('button', { name: /Rachit Agarwal/ }).click();
    await page.getByText('You are').waitFor();
    expect(await page.locator('.whoami b').textContent()).toBe('Rachit Agarwal');

    // Settings: the GitHub token, tested on saving, shown only masked; then the account.
    await page.getByRole('link', { name: 'Settings' }).click();
    const key = page.locator('[data-key="GITHUB_TOKEN"]');
    await key.getByLabel('GitHub token').fill(TOKEN);
    await key.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').textContent()).resolves.toBe(
      'The GitHub token is saved. GitHub knows this token as e2e-bot.',
    );
    await expect(key.locator('.light.green').count()).resolves.toBe(1);
    await expect(key.locator('.key-head small').textContent()).resolves.toBe('••••0001');
    expect(await page.content()).not.toContain(TOKEN);
    await page.getByPlaceholder('Account or organisation').fill('e2e-org');
    await page.locator('#github').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').textContent()).resolves.toBe(
      'New products will be created under e2e-org on GitHub.',
    );

    // A new product: its page, and its repository with the work in it.
    await page.getByRole('link', { name: '◀ Home' }).click();
    await page.getByLabel('Name').fill('Tiffin');
    await page
      .getByLabel('The idea, in one line')
      .fill('Lunch boxes by subscription, for offices.');
    await page.getByRole('button', { name: 'Start the product' }).click();
    await page.waitForURL(/\/site\/tiffin\?/);
    await expect(page.locator('.flag').first().textContent()).resolves.toBe(
      'The repository e2e-org/tiffin is created and holds the work.',
    );
    await expect(
      page.locator('.console').getByRole('link', { name: 'e2e-org/tiffin' }).count(),
    ).resolves.toBe(1);
    const bare = path.join(work, 'github', 'e2e-org', 'tiffin.git');
    expect(
      execFileSync('git', ['-C', bare, 'log', '--format=%an|%s', 'main'], {
        encoding: 'utf8',
      }).trim(),
    ).toBe('Rachit Agarwal|Start Tiffin: Lunch boxes by subscription, for offices.');

    // Test drive, from the home page, to a pass in words.
    await page.goto(`${server.browserUrl}/`);
    await page.getByRole('button', { name: 'Test drive' }).click();
    await page.waitForURL(/\/testdrive$/);
    await page
      .locator('[data-status="passed"], [data-status="failed"]')
      .waitFor({ timeout: 300_000 });
    const verdict = await page.locator('.verdict').getAttribute('data-status');
    const steps = await page.locator('.steps li').allTextContents();
    expect(verdict, steps.join('\n')).toBe('passed');
    expect(steps).toHaveLength(7);
    await page.getByRole('link', { name: 'Look at the sample product it built' }).click();
    await page.locator('.console [data-tally]').waitFor();
    await expect(page.locator('.console [data-tally]').textContent()).resolves.toBe(
      '1 Verified 2 Confirmed 0 Unverified',
    );

    // The token is in no log and in no file in the clear.
    expect(server.output()).not.toContain(TOKEN);
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name === 'node_modules' || e.name === '.next'
          ? []
          : e.isDirectory()
            ? files(path.join(dir, e.name))
            : [path.join(dir, e.name)],
      );
    for (const f of files(work)) expect(readFileSync(f).includes(TOKEN), f).toBe(false);
    expect(errors).toEqual([]);
  }, 600_000);
});
