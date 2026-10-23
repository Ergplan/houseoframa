import { describe, expect, it, vi } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import { handleConfirmReport, type ConfirmReportDeps } from './handler';

const at = new Date('2026-10-23T19:00:00Z');
const REPORT = '11111111-1111-4111-8111-111111111111';
const deps = (over: Partial<ConfirmReportDeps> = {}): ConfirmReportDeps => ({
  locate: (id) =>
    id === 'shop' ? ({ id: 'shop', name: 'Shop', repoDir: '/x' } as unknown as SiteLocation) : null,
  memberName: 'Asha Rao',
  personId: async () => 'p1',
  confirm: vi.fn(async (i) => ({ person: i.person, at: i.at.toISOString() })),
  now: () => at,
  ...over,
});

describe('POST /api/site/[siteId]/audit/confirm', () => {
  it("records the local member's confirmation of the report's drafted text", async () => {
    const d = deps();
    const r = await handleConfirmReport('shop', { reportId: REPORT }, d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      confirmation: { person: 'Asha Rao', at: at.toISOString() },
    });
    expect(d.confirm).toHaveBeenCalledWith({
      siteId: 'shop',
      reportId: REPORT,
      person: 'Asha Rao',
      personId: 'p1',
      at,
    });
  });

  it('answers 404 for an unknown site or report, 400 for a bad body, 409 with no member, 503 when nobody can be named', async () => {
    expect((await handleConfirmReport('nope', { reportId: REPORT }, deps())).status).toBe(404);
    expect((await handleConfirmReport('shop', { reportId: 'x' }, deps())).status).toBe(400);
    expect(
      (await handleConfirmReport('shop', { reportId: REPORT }, deps({ memberName: '' }))).status,
    ).toBe(409);
    expect(
      (
        await handleConfirmReport(
          'shop',
          { reportId: REPORT },
          deps({ personId: () => Promise.reject(new Error('db down')) }),
        )
      ).status,
    ).toBe(503);
    const missing = deps({
      confirm: () => Promise.reject(new Error(`no audit report ${REPORT} for site "shop"`)),
    });
    expect((await handleConfirmReport('shop', { reportId: REPORT }, missing)).status).toBe(404);
  });
});
