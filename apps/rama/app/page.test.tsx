import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from './page';
import { shortSha } from '../components/BuildStamp';

// A signed-in member who owns every site (authorization is tested in app/authz.test.tsx).
vi.mock('../server/session', async (orig) =>
  (await import('../test/session-mock')).sessionMock(await orig()),
);

const original = process.env.GIT_SHA;
afterEach(() => {
  process.env.GIT_SHA = original;
});

describe('route /', () => {
  it('renders the name and the short SHA from GIT_SHA', async () => {
    process.env.GIT_SHA = '73a3e6b0c1d2e3f405162738495a6b7c8d9e0f1a';
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('House of Rama · Built on trust');
    expect(html).toContain('commit 73a3e6b');
  });

  it("lists the signed-in member's sites", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('href="/site/self"');
    expect(html).toContain('House of Rama</a>');
  });

  it('says the commit is unknown when GIT_SHA is missing', async () => {
    delete process.env.GIT_SHA;
    expect(renderToStaticMarkup(await Home())).toContain('commit unknown');
  });
});

describe('shortSha', () => {
  it('accepts short and full SHAs and rejects anything else', () => {
    expect(shortSha('73A3E6B')).toBe('73a3e6b');
    expect(shortSha('not-a-sha')).toBeNull();
    expect(shortSha('')).toBeNull();
    expect(shortSha(undefined)).toBeNull();
  });
});
