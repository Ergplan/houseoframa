import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const original = process.env.GIT_SHA;
afterEach(() => {
  process.env.GIT_SHA = original;
});

describe('GET /api/health', () => {
  it('answers 200 with ok and the short commit', async () => {
    process.env.GIT_SHA = '199b823c0ffee';
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: '199b823' });
  });

  it('says unknown rather than inventing a commit', async () => {
    delete process.env.GIT_SHA;
    expect(await GET().json()).toEqual({ ok: true, commit: 'unknown' });
  });
});
