const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const here = process.argv[2]; const out = path.join(here, 'frames'); fs.mkdirSync(out, { recursive: true });
const body = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
const scenes = [['arena',1200],['plan',6500],['design',4000],['foundation',22000],['film',46000],['run',20000],['flow',9000],['flag',1500],['ask',9000],['walk',1200]];
(async () => {
  const browser = await chromium.launch();
  for (const [scene, wait] of scenes) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => console.log('pageerror', e.message));
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(s => { location.hash = s; }, scene);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(out, `${scene}.png`) });
    console.log('frame', scene);
    await page.close();
  }
  await browser.close();
})();
