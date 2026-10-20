// Stage 3 on EkBill, the real target: its built app is captured with Playwright, and its five headline
// figures re-execute EkBill's own functions and match the text on its screens. EkBill's remote is
// private, so this project runs where work/ekbill exists (this machine), not in CI (KNOWN-GAPS).
// It captures into a temporary directory, so the site's own shots are left as they are.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { locateSite, readSiteBlueprint } from '../packages/blueprint/src/site.ts';
import { capture, type Capture } from '../packages/trace/src/capture.ts';
import { showroomOf, type Showroom } from '../packages/trace/src/showroom.ts';
import type { Blueprint } from '@rama/shared';

const FIVE = [
  'gst-quarter-gst',
  'gst-quarter-taxable',
  'dues-total',
  'bill-total',
  'walkin-bill-total',
];
let out: string;
let cap: Capture;
let room: Showroom;
let bp: Blueprint;

beforeAll(async () => {
  const site = locateSite('ekbill')!;
  bp = readSiteBlueprint(site)!;
  out = mkdtempSync(path.join(tmpdir(), 'rama-ekbill-'));
  // Build only when there is no build yet: the watcher runs this often.
  const built = existsSync(path.join(site.repoDir, 'apps/web/.next/BUILD_ID'));
  cap = await capture(site, bp, { outDir: out, build: !built });
  room = showroomOf(cap, bp);
}, 600_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

describe('stage 3 on EkBill', () => {
  it('captures at least 8 real screens, each with at least one brick behind it', () => {
    expect(cap.screens.length).toBeGreaterThanOrEqual(8);
    for (const s of cap.screens) {
      expect(s.bricks.length, s.name).toBeGreaterThanOrEqual(1);
      expect(existsSync(path.join(out, 'shots', s.shot)), s.shot).toBe(true);
    }
  });

  it("re-executes the five headline figures with EkBill's own functions, and each matches the on-screen text", () => {
    // Trails are kept per appearance (`<screen>/<figure>`): every appearance of each figure must match.
    for (const id of FIVE) {
      const appearances = Object.entries(room.trails).filter(([key]) => key.endsWith(`/${id}`));
      expect(appearances.length, id).toBeGreaterThanOrEqual(1);
      for (const [key, t] of appearances) {
        expect(t.reexecuted, `${key}: ${t.reexecutionError ?? ''}`).toBe(true);
        expect(t.result, key).toMatchObject({ matches: true });
        expect(t.result!.computed, key).toMatch(/^₹[\d,]+(\.\d\d)?$/);
      }
    }
  });

  it('marks every other figure on the screens untraced', () => {
    const figures = room.screens.flatMap((s) => s.figures);
    expect(figures.filter((f) => f.traced).every((f) => FIVE.includes(f.id))).toBe(true);
    expect(figures.filter((f) => !f.traced).length).toBeGreaterThan(0);
    expect(room.counts.shown).toBe(figures.length);
  });
});
