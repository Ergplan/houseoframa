// Clicking a cell or a column of a table of the ground opened, in a real browser (Stage 11): the slab is
// laid out by the same pure function the page uses, from what the page lists of the table (the same
// columns, rows and pipes as the picture), so the test knows where each cell is drawn.
import type { Page } from 'playwright';
import { cellPoint, ground, type GroundInput } from '../packages/stage/src/index.ts';

/** Row −1 is the column's head. */
export async function clickGround(page: Page, row: number, col: number): Promise<void> {
  const canvas = page.locator('[data-level="ground"] canvas[data-ready="true"]');
  await canvas.waitFor({ timeout: 60_000 });
  const table = page.locator('table[data-ground-table]');
  const input: GroundInput = {
    table: (await table.getAttribute('data-ground-table'))!,
    columns: await table.locator('th').evaluateAll((ths) =>
      ths.map((th) => ({
        name: th.getAttribute('data-name')!,
        type: th.getAttribute('data-type')!,
        key: (th.getAttribute('data-key') || null) as 'primary' | 'link' | null,
        figure: th.getAttribute('data-figure') === 'yes',
        masked: th.getAttribute('data-masked') === 'yes',
      })),
    ),
    rows: await table
      .locator('tbody tr')
      .evaluateAll((trs) =>
        trs.map((tr) =>
          [...tr.querySelectorAll('td')].map((td) =>
            td.getAttribute('data-empty') === 'yes' ? null : (td.textContent ?? ''),
          ),
        ),
      ),
    readBy: JSON.parse((await table.getAttribute('data-read-by'))!),
    writtenBy: JSON.parse((await table.getAttribute('data-written-by'))!),
    note: null,
  };
  const orientation = (await canvas.getAttribute('data-orientation')) as 'north';
  const s = ground(input, orientation);
  const q = cellPoint(s, row, col);
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const w = Number(await canvas.getAttribute('width'));
  const h = Number(await canvas.getAttribute('height'));
  await page.mouse.click(rect.x + (q.x * rect.width) / w, rect.y + (q.y * rect.height) / h);
}
