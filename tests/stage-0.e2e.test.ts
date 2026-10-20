// Stage 0 end to end: the real Next.js dev server serves / with the product line and the short SHA.
// Stage 0 has no target repository yet; from Stage 1 each stage's e2e runs on a real target.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevServer, type DevServer } from './dev-server.ts';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
let server: DevServer;

beforeAll(async () => {
  server = await startDevServer({ GIT_SHA: SHA });
}, 100_000);

afterAll(() => server?.stop());

describe('stage 0 e2e', () => {
  it('serves / with "House of Rama · Built on trust" and the short SHA', async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('House of Rama · Built on trust');
    expect(html).toContain('commit abcdef0');
  });
});

describe('stage 1 e2e: the health route on the real dev server', () => {
  it('serves GET /api/health', async () => {
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: 'abcdef0' });
  });
});
