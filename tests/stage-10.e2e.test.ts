// Stage 10 end to end, in a real browser on the real dev server, with no command typed: the trainer
// starts a rehearsal on the sample product, opens the session with the voice, and runs acts 1 to 3 by
// voice, saying what the recorded rehearsal says (fixtures/rehearsal): the idea, the brains (the rule
// read aloud), a yes to each card, Close ideation, the design explained aloud, and "Yes, build it" as the
// first signature. With no key the voice is the stand-in, which reads exactly the lines it is handed;
// the live voice with the recorded audio is stage-10.vendor.e2e.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createDb } from '@rama/db';
import { listDecisions, listSessions } from '../packages/ceremony/src/store.ts';
import { startDevServer, type DevServer } from './dev-server.ts';
import { throwawayDb } from './session.ts';

const MEMBER = 'Rachit Agarwal';
const SCRIPT = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../fixtures/rehearsal/script.json'), 'utf8'),
) as { speaker: string; turns: { at: string; text: string }[] };
let work: string;
let server: DevServer;
let browser: Browser;
let db: Awaited<ReturnType<typeof throwawayDb>>;

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-e2e10-'));
  db = await throwawayDb(MEMBER);
  server = await startDevServer(
    {
      RAMA_WORK_DIR: work,
      DATABASE_URL: db.url,
      AUTH_MODE: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GITHUB_TOKEN: '',
      RAMA_VOICE: 'stand-in',
    },
    ['/login', '/testdrive', '/site/rehearsal-1/discovery', '/site/rehearsal-1'],
  );
  browser = await chromium.launch();
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
  await db?.drop();
  if (work) rmSync(work, { recursive: true, force: true });
});

/** Says one turn as the member, and waits until the voice has read every line that came back. */
async function say(page: Page, text: string) {
  const before = await page
    .locator('[data-testid="voice-transcript"] li')
    .count()
    .catch(() => 0);
  const box = page.getByLabel(`What ${SCRIPT.speaker} said`);
  await box.fill(text);
  await page
    .getByRole('region', { name: 'The voice' })
    .getByRole('button', { name: 'Send' })
    .click();
  // The person's own turn, then at least one line read by the voice, then the bar at rest.
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="voice-transcript"] li').length >= n + 2,
    before,
  );
  await page.locator('.eg-voice[data-state="idle"]').waitFor();
}

const lastSaid = (page: Page) =>
  page.locator('[data-testid="voice-transcript"] li.agent').last().innerText();

describe('stage 10 e2e', () => {
  it('a rehearsal on the sample product: acts 1 to 3 by voice, the first signature a spoken yes', async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    ).newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(120_000);
    await page.goto(`${server.browserUrl}/login`);
    await page.getByRole('button', { name: new RegExp(MEMBER) }).click();
    await page.locator('.whoami').waitFor();

    // The trainer starts a rehearsal from Test drive; its cards are drafted, open.
    await page.goto(`${server.browserUrl}/testdrive`);
    await page.getByRole('button', { name: 'Start a rehearsal' }).click();
    await page.waitForURL(/\/site\/rehearsal-1\/discovery/);

    // Act 1: who is in the room, then the voice greets them.
    const start = page.locator('.voice-start');
    expect(await start.innerText()).toContain(
      'It is the stand-in voice: this server is set to use the stand-in voice.',
    );
    await start.getByRole('button', { name: 'Start the session with the voice' }).click();
    await page.locator('[data-testid="voice-transcript"] li.agent').first().waitFor();
    expect(await lastSaid(page)).toMatch(
      /^Rama Welcome, Rachit Agarwal\. I am the voice of House of Rama\./,
    );

    // Act 2: the idea, the brains with the rule read aloud, then each card read and decided by a yes.
    const act2 = SCRIPT.turns.filter((t) => t.at === 'act 2');
    await say(page, act2[0]!.text);
    expect(await lastSaid(page)).toContain(
      'Which company builds it, which checks it, and which speaks? The rule: the checker is never the builder.',
    );
    await say(page, act2[1]!.text);
    expect(await lastSaid(page)).toContain(
      'Claude Code, from Anthropic, builds; OpenAI checks; Anthropic drafts; OpenAI speaks. The checker is never the builder. Shall I write that down?',
    );
    for (const t of act2.slice(2)) await say(page, t.text);
    expect(await lastSaid(page)).toContain('Every card is decided.');

    // Act 3: Close ideation; the design aloud, card by card with no builder key; "Shall I build this?".
    await page.getByRole('button', { name: 'Close ideation' }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="voice-transcript"] li.agent')].some((l) =>
        l.textContent?.includes('Shall I build this?'),
      ),
    );
    await page.locator('.eg-voice[data-state="idle"]').waitFor();
    const narrated = await page.locator('[data-testid="voice-transcript"]').innerText();
    expect(narrated).toContain('It does not save a new order yet, take a payment, print a bill');
    await say(page, SCRIPT.turns.find((t) => t.at === 'act 3')!.text);
    expect(await lastSaid(page)).toContain(
      'Signed: Rachit Agarwal said yes, build it. That is the first signature.',
    );

    // The record: every card decided by the member's own spoken yes, the brains on a card, the design's
    // yes as signature one; every turn with its speaker; nothing the voice said beyond its lines.
    const conn = createDb(db.url);
    try {
      const cards = await listDecisions(conn.db, 'rehearsal-1');
      const decided = cards.filter((c) => c.status === 'decided');
      expect(decided.map((c) => c.by)).toEqual(Array(decided.length).fill(MEMBER));
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
      expect(decided.at(-1)!.statement).toMatch(
        /^Rachit Agarwal said yes to the design as it was explained aloud: /,
      );
      const turns = (await listSessions(conn.db, 'rehearsal-1')).flatMap((s) => s.turns);
      expect(turns.filter((t) => t.speaker === MEMBER).map((t) => t.text)).toEqual(
        SCRIPT.turns.map((t) => t.text),
      );
      expect(turns.filter((t) => t.speaker === 'House of Rama')).toEqual([]);
      expect(turns.filter((t) => t.speaker === 'Rama').length).toBeGreaterThan(SCRIPT.turns.length);
    } finally {
      await conn.close();
    }
  }, 900_000);
});
