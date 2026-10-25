// Authorization of every route and page (Stage 6), against real sessions in a throwaway database. Since
// Stage 7 the sessions come from the picker ("Who are you?"): two customers, each owning one site, and a
// trainer who opens both. No session: routes answer 401 and pages send to /login. Another customer's
// site: 404, the same as a site that does not exist. The owner gets through, and what they write carries
// the picked person.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { eq } from 'drizzle-orm';
import { createDb, decisions, people, runMigrations, seed, sites } from '@rama/db';
import { authDeps } from './api/auth/deps';
import { handlePick } from './api/auth/handlers';
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
const token: Record<'asha' | 'ravi' | 'tara', string> = { asha: '', ravi: '', tara: '' };
const MEMBERS = [
  { name: 'Asha Rao', role: 'customer' },
  { name: 'Ravi', role: 'customer' },
  { name: 'Tara', role: 'trainer' },
] as const;

/** Picks a name on "Who are you?" through the real handler and database; returns the session token. */
async function pick(name: string): Promise<string> {
  const f = new FormData();
  f.set('name', name);
  const r = await handlePick(f, {
    ...authDeps(new Request('http://rama.test/api/auth/pick')),
    mode: 'members',
    members: () => [...MEMBERS],
  });
  const set = r.headers.get('set-cookie') ?? '';
  return decodeURIComponent(/^rama_session=([^;]+)/.exec(set)![1]!);
}

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
  token.asha = await pick('Asha Rao');
  token.ravi = await pick('Ravi');
  token.tara = await pick('Tara');
  const [ravi] = await conn.db.select().from(people).where(eq(people.name, 'Ravi'));
  await conn.db.insert(sites).values({
    siteId: 'shop',
    name: 'Shop',
    repo: repo.dir,
    memberId: ravi!.id,
    createdBy: 'test',
  });
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

const as = (who: 'asha' | 'ravi' | 'tara' | null, init: RequestInit = {}) =>
  ({
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(who ? { cookie: `rama_session=${token[who]}` } : {}),
    },
  }) as RequestInit;
const post = (who: 'asha' | 'ravi' | 'tara' | null, body: unknown = {}) =>
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
    'POST decisions/yes',
    async () => (await import('./api/site/[siteId]/decisions/yes/route')).POST as Handler,
  ],
  [
    'POST decisions/scrap',
    async () => (await import('./api/site/[siteId]/decisions/scrap/route')).POST as Handler,
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
  [
    'POST structure/confirm',
    async () => (await import('./api/site/[siteId]/structure/confirm/route')).POST as Handler,
  ],
  [
    'POST handover',
    async () => (await import('./api/site/[siteId]/handover/route')).POST as Handler,
  ],
  ['POST checkin', async () => (await import('./api/site/[siteId]/checkin/route')).POST as Handler],
  ['POST act', async () => (await import('./api/site/[siteId]/act/route')).POST as Handler],
  [
    'POST repository',
    async () => (await import('./api/site/[siteId]/repository/route')).POST as Handler,
  ],
  [
    'POST features',
    async () => (await import('./api/site/[siteId]/features/route')).POST as Handler,
  ],
  ['POST brains', async () => (await import('./api/site/[siteId]/brains/route')).POST as Handler],
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
      expect((await h(post('asha'), ctx('shop'))).status).toBe(404);
      // The owner passes authorization: whatever comes back, it is not a refusal of who they are. This
      // runs on Ravi's site, a throwaway clone, so a route that writes to its checkout (the structure)
      // never touches this repository.
      const owner = (await h(post('ravi'), ctx('shop'))).status;
      expect([401, 403]).not.toContain(owner);
      expect(owner === 404 && name !== 'GET shots/[name]').toBe(false);
      // A trainer opens every site.
      const trainer = (await h(post('tara'), ctx('shop'))).status;
      expect([401, 403]).not.toContain(trainer);
      expect(trainer === 404 && name !== 'GET shots/[name]').toBe(false);
    });
  }

  it('what the picked person writes carries their name and their person id', async () => {
    const { POST } = await import('./api/site/[siteId]/decisions/route');
    const r = await POST(
      post('ravi', {
        title: 'Totals in rupees',
        statement: 'Show totals in rupees.',
        status: 'open',
      }),
      { params: Promise.resolve({ siteId: 'shop' }) },
    );
    expect(r.status).toBe(200);
    const conn = createDb();
    try {
      const [ravi] = await conn.db.select().from(people).where(eq(people.name, 'Ravi'));
      const [card] = await conn.db.select().from(decisions).where(eq(decisions.siteId, 'shop'));
      expect(card).toMatchObject({ by: 'Ravi', createdBy: ravi!.id });
      expect(ravi!.role).toBe('customer');
    } finally {
      await conn.close();
    }
  });

  it('POST /api/testdrive, /api/products and /api/settings/* need a session; Settings a trainer', async () => {
    const td = await import('./api/testdrive/route');
    expect((await td.POST(post(null))).status).toBe(401);
    const products = await import('./api/products/route');
    expect((await products.POST(post(null))).status).toBe(401);
    const keys = await import('./api/settings/keys/route');
    expect((await keys.POST(post(null))).status).toBe(401);
    expect((await keys.POST(post('asha'))).status).toBe(403);
    const gh = await import('./api/settings/github/route');
    expect((await gh.POST(post('ravi'))).status).toBe(403);
    const brains = await import('./api/settings/brains/route');
    expect((await brains.POST(post(null))).status).toBe(401);
    expect((await brains.POST(post('asha'))).status).toBe(403);
  });

  it('/settings is a trainer’s: to /login without a session, not found for a customer', async () => {
    const { default: Settings } = await import('./settings/page');
    cookie = undefined;
    await expect(Settings({})).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
    });
    cookie = token.asha;
    await expect(Settings({})).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    cookie = token.tara;
    expect(isValidElement(await Settings({}))).toBe(true);
  });

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
    [
      '/site/[siteId]/triptych',
      async () => (await import('./site/[siteId]/triptych/page')).default as never,
    ],
    [
      '/site/[siteId]/handover',
      async () => (await import('./site/[siteId]/handover/page')).default as never,
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
      cookie = token.tara;
      expect(isValidElement(await page(params('self')))).toBe(true);
    });
  }
});

describe('/', () => {
  it('lists only the signed-in member’s own sites, and nothing without a session', async () => {
    const { default: Home } = await import('./page');
    cookie = undefined;
    expect(renderToStaticMarkup(await Home())).toContain('Pick your name to see your products');
    cookie = token.asha;
    const asha = renderToStaticMarkup(await Home());
    expect(asha).toContain('href="/site/self"');
    expect(asha).not.toContain('href="/site/shop"');
    cookie = token.ravi;
    const ravi = renderToStaticMarkup(await Home());
    expect(ravi).toContain('href="/site/shop"');
    expect(ravi).not.toContain('href="/site/self"');
    cookie = token.tara;
    const tara = renderToStaticMarkup(await Home());
    expect(tara).toContain('href="/site/shop"');
    expect(tara).toContain('href="/site/self"');
  });
});

describe('the floor: booking needs a session, pages need a member, the pod light needs the controller token', () => {
  it('POST /api/bookings answers 401 without a session', async () => {
    const { POST } = await import('./api/bookings/route');
    expect(
      (
        await POST(
          post(null, {
            pod: 1,
            shift: 'game',
            startsAt: '2026-10-23T09:00:00Z',
            endsAt: '2026-10-23T10:00:00Z',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          post('asha', {
            pod: 9,
            shift: 'game',
            startsAt: '2026-10-23T09:00:00Z',
            endsAt: '2026-10-23T10:00:00Z',
          }),
        )
      ).status,
    ).toBe(404);
  });

  it('/book and /pod/<n> send to /login without a session', async () => {
    const { default: Book } = await import('./book/page');
    const { default: Pod } = await import('./pod/[n]/page');
    cookie = undefined;
    await expect(Book()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
    });
    await expect(Pod({ params: Promise.resolve({ n: '1' }) })).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
    });
    cookie = token.asha;
    await expect(Pod({ params: Promise.resolve({ n: '1' }) })).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });

  it('/campus is for a trainer or manager: /login without a session, not found for a customer', async () => {
    const { default: Campus } = await import('./campus/page');
    cookie = undefined;
    await expect(Campus()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/),
    });
    cookie = token.asha;
    await expect(Campus()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    cookie = token.tara;
    expect(isValidElement(await Campus())).toBe(true);
  });

  it('GET /api/pod/<n>/status refuses anyone without the controller token', async () => {
    const { GET } = await import('./api/pod/[n]/status/route');
    process.env.RAMA_POD_TOKEN = 'pod-secret';
    try {
      const ctx = { params: Promise.resolve({ n: '1' }) };
      expect(
        (await GET(new Request('http://rama.test/api/pod/1/status', as('asha')), ctx)).status,
      ).toBe(401);
      expect(
        (
          await GET(
            new Request('http://rama.test/api/pod/1/status', {
              headers: { authorization: 'Bearer pod-secret' },
            }),
            ctx,
          )
        ).status,
      ).toBe(404);
    } finally {
      delete process.env.RAMA_POD_TOKEN;
    }
  });
});
