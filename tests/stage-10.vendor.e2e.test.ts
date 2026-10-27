// @vendor — Stage 10's rehearsal with the real voice and recorded audio: the same acts 1 to 3 as
// stage-10.e2e.test.ts, but the voice is OpenAI's Realtime voice over WebRTC, opened by the server with
// the OpenAI key, and what the member says is the recorded rehearsal's audio (fixtures/rehearsal/*.wav),
// played into the call in place of the microphone while the member's talk button is held. The voice
// hears it, the transcript goes to House of Rama with the member's name, and the voice reads back only
// the lines it is handed. Run on request only (RAMA_VENDOR_TESTS=1); it costs some tens of rupees.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createDb, modelCalls } from '@rama/db';
import { listDecisions, listSessions } from '../packages/ceremony/src/store.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { throwawayDb } from './session.ts';

const MEMBER = 'Rachit Agarwal';
const DIR = path.resolve(import.meta.dirname, '../fixtures/rehearsal');
const SCRIPT = JSON.parse(readFileSync(path.join(DIR, 'script.json'), 'utf8')) as {
  speaker: string;
  turns: { at: string; text: string; clip: string }[];
};
const clip = (name: string) =>
  `data:audio/wav;base64,${readFileSync(path.join(DIR, name)).toString('base64')}`;
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;

beforeAll(async () => {
  expect(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY').toBeTruthy();
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e10v-'));
  db = await throwawayDb(MEMBER);
  server = await startDevServer(
    {
      RAMA_WORK_DIR: work,
      DATABASE_URL: db.url,
      AUTH_MODE: '',
      ANTHROPIC_API_KEY: '',
      GITHUB_TOKEN: '',
      RAMA_VOICE: '',
      RAMA_VOICE_CLIPS: '1',
    },
    ['/login', '/testdrive', '/site/rehearsal-1/discovery'],
  );
  browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

const agentLines = (page: Page) => page.locator('[data-testid="voice-transcript"] li.agent');

/** Plays one clip as the member, and waits until the voice has read every line that came back. */
async function say(page: Page, name: string) {
  const before = await page
    .locator('[data-testid="voice-transcript"] li')
    .count()
    .catch(() => 0);
  await page.evaluate(
    async ([who, url]) => {
      const v = (
        window as unknown as { ramaVoice: { say: (w: string, u: string) => Promise<void> } }
      ).ramaVoice;
      await v.say(who!, url!);
    },
    [SCRIPT.speaker, clip(name)],
  );
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="voice-transcript"] li').length >= n + 2,
    before,
    { timeout: 120_000 },
  );
  await page.evaluate(() =>
    (window as unknown as { ramaVoice: { idle: () => Promise<void> } }).ramaVoice.idle(),
  );
}

describe('@vendor stage 10 e2e, the real voice', () => {
  it('a rehearsal by voice with recorded audio: acts 1 to 3, the first signature a spoken yes', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(180_000);
    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(MEMBER) }).click();
    await page.locator('.whoami').waitFor();
    await page.goto(`${server.browserUrl}/testdrive`);
    await page.getByRole('button', { name: 'Start a rehearsal' }).click();
    await page.waitForURL(/\/site\/rehearsal-1\/discovery/);

    const start = page.locator('.voice-start');
    expect(await start.innerText()).toContain('It speaks with OpenAI (gpt-realtime).');
    await start.getByLabel('Test drive').uncheck();
    await start.getByRole('button', { name: 'Start the session with the voice' }).click();
    await agentLines(page).first().waitFor();
    await page.evaluate(() =>
      (window as unknown as { ramaVoice: { idle: () => Promise<void> } }).ramaVoice.idle(),
    );

    for (const t of SCRIPT.turns.filter((x) => x.at === 'act 2')) await say(page, t.clip);
    await page.getByRole('button', { name: 'Close ideation' }).click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="voice-transcript"] li.agent')].some((l) =>
          /build this/i.test(l.textContent ?? ''),
        ),
      undefined,
      { timeout: 300_000 },
    );
    await page.evaluate(() =>
      (window as unknown as { ramaVoice: { idle: () => Promise<void> } }).ramaVoice.idle(),
    );
    await say(page, SCRIPT.turns.find((x) => x.at === 'act 3')!.clip);
    const transcript = await page.locator('[data-testid="voice-transcript"]').innerText();
    console.log(transcript);

    const conn = createDb(db.url);
    try {
      const decided = (await listDecisions(conn.db, 'rehearsal-1')).filter(
        (c) => c.status === 'decided',
      );
      expect(decided.map((c) => c.title)).toEqual([
        'The brains',
        'Build the chai stall',
        'Money is kept in paise',
        'The sample day',
        'Building: See today’s orders',
        'Building: Take an order',
        'Building: Count the day’s takings',
        'What it will not do',
        'Yes, build it',
      ]);
      expect(new Set(decided.map((c) => c.by))).toEqual(new Set([MEMBER]));
      const turns = (await listSessions(conn.db, 'rehearsal-1')).flatMap((s) => s.turns);
      // What the voice heard, in the member's name: the recorded words, as transcribed.
      expect(turns.filter((t) => t.speaker === MEMBER)).toHaveLength(SCRIPT.turns.length);
      // The voice said no number it was not handed.
      expect(turns.filter((t) => t.speaker === 'House of Rama').map((t) => t.text)).toEqual([]);
      const rows = (await conn.db.select().from(modelCalls)).filter((r) => r.role === 'voice');
      // One row for opening the session, and one per line the voice read, with the vendor's tokens.
      const lines = rows.filter((r) => (r.input as { line?: string }).line !== undefined);
      expect(rows.length).toBe(lines.length + 1);
      expect(lines.length).toBe(turns.filter((t) => t.speaker === 'Rama').length);
      expect(lines.every((r) => (r.outputTokens ?? 0) > 0)).toBe(true);
      const sum = (k: 'inputTokens' | 'outputTokens') => lines.reduce((n, r) => n + (r[k] ?? 0), 0);
      console.log(
        `voice: ${lines.length} lines, ${sum('inputTokens')} tokens in, ${sum('outputTokens')} out`,
      );
    } finally {
      await conn.close();
    }
  }, 1_500_000);
});
