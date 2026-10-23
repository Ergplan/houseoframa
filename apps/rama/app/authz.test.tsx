// Authorization of every route and page (Stage 6), against real sessions in a throwaway database: two
// members, each owning one site. No session: routes answer 401 and pages send to /login. The other
// member's site: 404, the same as a site that does not exist. The owner gets through.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addMember, createDb, issueLink, redeemLink, runMigrations, seed, sites } from '@rama/db';
import { addSite } from '@rama/blueprint/site';
import { fixtureRepo, type FixtureRepo } from '../../../packages/blueprint/test/fixture-repo';

// Pages read the session cookie through next/headers; here it is whichever token the test sets.
let cookie: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'rama_session' && cookie ? { value: cookie } : undefined),
  }),
}));

const serverUrl = process.env.DATABASE_URL!;
const original = { db: process.env.DATABASE_URL, work: process.env.RAMA_WORK_DIR };
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let repo: FixtureRepo;
let work: string;
const token: Record<'asha' | 'ravi', string> = { asha: '', ravi: '' };

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL = Object.assign(new URL(serverUrl), {
    pathname: `/${dbName}`,
  }).toString();
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'app/page.tsx': 'export default function H() { return null; }\n',
  });
  repo.commit('shop');
  work = mkdtempSync(path.join(tmpdir(), 'rama-authz-'));
  process.env.RAMA_WORK_DIR = work;
  addSite(repo.dir, { id: 'shop', name: 'Shop', env: process.env });
  const conn = createDb();
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' }); // Asha owns "self"
  await addMember(conn.db, { email: 'asha@example.com', name: 'Asha Rao', createdBy: 'test' });
  const ravi = await addMember(conn.db, {
    email: 'ravi@example.com',
    name: 'Ravi',
    createdBy: 'test',
  });
  await conn.db
    .insert(sites)
    .values({ siteId: 'shop', name: 'Shop', repo: repo.dir, memberId: ravi.id, createdBy: 'test' });
  for (const who of ['asha', 'ravi'] as const) {
    const link = (await issueLink(conn.db, `${who}@example.com`))!;
    token[who] = (await redeemLink(conn.db, link.token))!.sessionToken;
  }
  await conn.close();
});

afterAll(async () => {
  process.env.DATABASE_URL = original.db;
  if (original.work === undefined) delete process.env.RAMA_WORK_DIR;
  else process.env.RAMA_WORK_DIR = original.work;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  repo?.cleanup();
  rmSync(work, { recursive: true, force: true });
});

const as = (who: 'asha' | 'ravi' | null, init: RequestInit = {}) =>
  ({
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(who ? { cookie: `rama_session=${token[who]}` } : {}),
    },
  }) as RequestInit;
const post = (who: 'asha' | 'ravi' | null, body: unknown = {}) =>
  new Request('http://rama.test/x', as(who, { method: 'POST', body: JSON.stringify(body) }));

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const siteRoutes: [string, () => Promise<Handler>][] = [
  ['POST sign', async () => (await import('./api/site/[siteId]/sign/route')).POST as Handler],
  [
    'POST decisions',
    async () => (await import('./api/site/[siteId]/decisions/route')).POST as Handler,
  ],
  [
    'POST discovery/sessions',
    async () => (await import('./api/site/[siteId]/discovery/sessions/route')).POST as Handler,
  ],
  [
    'POST discovery/turns',
    async () => (await import('./api/site/[siteId]/discovery/turns/route')).POST as Handler,
  ],
  [
    'POST discovery/ask',
    async () => (await import('./api/site/[siteId]/discovery/ask/route')).POST as Handler,
  ],
  ['POST confirm', async () => (await import('./api/site/[siteId]/confirm/route')).POST as Handler],
  [
    'POST audit/confirm',
    async () => (await import('./api/site/[siteId]/audit/confirm/route')).POST as Handler,
  ],
  [
    'GET shots/[name]',
    async () => (await import('./api/site/[siteId]/shots/[name]/route')).GET as Handler,
  ],
];

describe('every site route: 401 without a session, 404 for another member’s site, through for the owner', () => {
  for (const [name, load] of siteRoutes) {
    it(name, async () => {
      const h = await load();
      const ctx = (siteId: string) => ({ params: Promise.resolve({ siteId, name: 'home.png' }) });
      expect((await h(post(null), ctx('self'))).status).toBe(401);
      expect((await h(post(null), ctx('nope'))).status).toBe(401);
      expect((await h(post('ravi'), ctx('self'))).status).toBe(404);
      expect((await h(post('asha'), ctx('nope'))).status).toBe(404);
      // The owner passes authorization: whatever comes back, it is not a refusal of who they are.
      expect([401, 403]).not.toContain((await h(post('asha'), ctx('self'))).status);
      expect(
        (await h(post('asha'), ctx('self'))).status === 404 && name !== 'GET shots/[name]',
      ).toBe(false);
    });
  }

  it('GET /api/health stays public', async () => {
    const { GET } = await import('./api/health/route');
    expect((await GET()).status).toBe(200);
  });
});

describe('every site page: to /login without a session, not found for another member’s site', () => {
  const pages: [
    string,
    () => Promise<(p: { params: Promise<{ siteId: string }> }) => Promise<unknown>>,
  ][] = [
    ['/site/[siteId]', async () => (await import('./site/[siteId]/page')).default as never],
    [
      '/site/[siteId]/showroom',
      async () => (await import('./site/[siteId]/showroom/page')).default as never,
    ],
    [
      '/site/[siteId]/discovery',
      async () => (await import('./site/[siteId]/discovery/page')).default as never,
    ],
    [
      '/site/[siteId]/walkthrough',
      async () => (await import('./site/[siteId]/walkthrough/page')).default as never,
    ],
    [
      '/site/[siteId]/audit',
      async () => (await import('./site/[siteId]/audit/page')).default as never,
    ],
  ];
  for (const [name, load] of pages) {
    it(name, async () => {
      const page = await load();
      const params = (siteId: string) => ({
        params: Promise.resolve({ siteId }),
        searchParams: Promise.resolve({}),
      });
      cookie = undefined;
      await expect(page(params('self'))).rejects.toMatchObject({
        digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
      });
      cookie = token.ravi;
      await expect(page(params('self'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
      cookie = token.asha;
      await expect(page(params('shop'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
      expect(isValidElement(await page(params('self')))).toBe(true);
    });
  }
});

describe('/', () => {
  it('lists only the signed-in member’s own sites, and nothing without a session', async () => {
    const { default: Home } = await import('./page');
    cookie = undefined;
    expect(renderToStaticMarkup(await Home())).toContain('to see your sites');
    cookie = token.asha;
    const asha = renderToStaticMarkup(await Home());
    expect(asha).toContain('href="/site/self"');
    expect(asha).not.toContain('href="/site/shop"');
    cookie = token.ravi;
    const ravi = renderToStaticMarkup(await Home());
    expect(ravi).toContain('href="/site/shop"');
    expect(ravi).not.toContain('href="/site/self"');
  });
});
