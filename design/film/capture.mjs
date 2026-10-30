// Captures the reference frames of the film at 1920×1080: `node design/film/capture.mjs`.
// Each frame is the specification for that scene; Stage 13's look test compares the app against them.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, 'frames');
mkdirSync(out, { recursive: true });
const body = readFileSync(path.join(here, 'index.html'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
const scenes = [
  ['arena', 1200],
  ['plan', 6500],
  ['design', 4000],
  ['foundation', 22000],
  ['film', 46000],
  ['run', 20000],
  ['ground', 24000],
  ['flow', 9000],
  ['flag', 1500],
  ['ask', 9000],
  ['walk', 1200],
];
const browser = await chromium.launch();
for (const [scene, wait] of scenes) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate((s) => {
    globalThis.location.hash = s;
  }, scene);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(out, `${scene}.png`) });
  console.log('frame', scene);
  await page.close();
}
await browser.close();
