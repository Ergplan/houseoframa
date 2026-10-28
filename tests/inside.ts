// Clicking a brick inside its building in a real browser (Stage 11): the inside is laid out by the same
// pure functions the page uses, so the test knows where each brick is drawn; its floor is chosen first,
// as a person would to reach a brick under the floors above.
import type { Page } from 'playwright';
import type { Blueprint } from '@rama/shared';
import {
  insidesOf,
  pointOf,
  resolveFeatures,
  street,
  type FeaturesFile,
} from '../packages/stage/src/index.ts';

export async function clickInside(
  page: Page,
  base: string,
  siteId: string,
  bp: Blueprint,
  features: FeaturesFile | null,
  brick: string,
): Promise<void> {
  const st = street(bp, resolveFeatures(bp, features), {});
  const s = insidesOf(bp, st.buildings).find((x) => x.bricks.some((b) => b.path === brick))!;
  const x = s.bricks.find((b) => b.path === brick)!;
  if (!page.url().includes(`b=${s.id}`))
    await page.goto(`${base}/site/${siteId}?at=code&b=${s.id}`);
  const canvas = page.locator('[data-level="inside"] canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 60_000 });
  await page.locator(`button[data-floor="${x.floor}"]`).click();
  await canvas.scrollIntoViewIfNeeded();
  const q = pointOf(s, brick)!;
  const rect = (await canvas.boundingBox())!;
  const w = Number(await canvas.getAttribute('width'));
  const h = Number(await canvas.getAttribute('height'));
  await page.mouse.click(rect.x + (q.x * rect.width) / w, rect.y + (q.y * rect.height) / h);
}
