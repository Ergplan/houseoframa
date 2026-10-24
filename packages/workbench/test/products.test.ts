// Products (Stage 7) against a throwaway database, a temporary work dir and a stubbed GitHub whose
// "repository" is a local bare repository: New product makes the site, its first commit, its open first
// card and the gate with House of Rama's public key; Create repository creates it under the account in
// Settings and sends the work there, keeping the token out of every file.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import {
  createDb,
  ensurePerson,
  GITHUB_OWNER,
  putSetting,
  runMigrations,
  setSecret,
  sites,
  type Member,
} from '@rama/db';
import { appSealer, listDecisions } from '@rama/ceremony';
import { siteRecord } from '@rama/blueprint/site';
import {
  createProductRepository,
  newProduct,
  productId,
  type ProductDeps,
} from '../src/products.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let work: string;
let asha: Member;
const TOKEN = 'ghp_TestTokenThatMustNeverBeWritten0001';

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  asha = await ensurePerson(conn.db, { name: 'Asha Rao', role: 'trainer' }, 'test');
  work = mkdtempSync(path.join(tmpdir(), 'rama-products-'));
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

/** A GitHub that knows one account and creates each repository as a bare repository on disk. */
function stubGitHub(opts: { exists?: boolean } = {}) {
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    if (u.pathname === '/user') return Response.json({ login: 'asha-gh' });
    const m = /^\/(?:orgs\/([^/]+)|user)\/repos$/.exec(u.pathname);
    if (m && init?.method === 'POST') {
      if (opts.exists)
        return Response.json(
          {
            message: 'Repository creation failed.',
            errors: [{ message: 'name already exists on this account' }],
          },
          { status: 422 },
        );
      const { name } = JSON.parse(String(init.body)) as { name: string };
      const owner = m[1] ?? 'asha-gh';
      const bare = path.join(work, 'github', owner, `${name}.git`);
      execFileSync('git', ['init', '--quiet', '--bare', bare]);
      return Response.json({
        full_name: `${owner}/${name}`,
        html_url: `https://github.com/${owner}/${name}`,
        clone_url: bare,
      });
    }
    return new Response('{}', { status: 404 });
  });
  return fetch;
}

const deps = (fetch: ReturnType<typeof stubGitHub>): ProductDeps => ({
  github: { fetch: fetch as unknown as typeof globalThis.fetch, api: 'https://api.github.test' },
  env: { ...process.env, RAMA_WORK_DIR: work },
  now: () => new Date('2026-10-24T10:00:00Z'),
});

describe('productId', () => {
  it('makes an id from the name, unique, never "self"', () => {
    expect(productId('ergPLAN', () => false)).toBe('ergplan');
    expect(productId('  Chai Stall — Orders! ', () => false)).toBe('chai-stall-orders');
    expect(productId('Shop', (id) => id === 'shop' || id === 'shop-2')).toBe('shop-3');
    expect(productId('Self', () => false)).toBe('self-product');
    expect(productId('!!!', () => false)).toBe('product');
  });
});

describe('New product', () => {
  it('without GitHub: the site, first commit, open first card and gate, kept on this laptop', async () => {
    const fetch = stubGitHub();
    const { site, flags } = await newProduct(
      conn.db,
      {
        name: 'Chai Stall',
        idea: 'Track the day’s chai orders and the day’s takings.',
        person: asha,
      },
      deps(fetch),
    );
    expect(site).toMatchObject({ id: 'chai-stall', kind: 'product' });
    expect(fetch).not.toHaveBeenCalled();
    expect(flags.map((f) => f.ok)).toEqual([true, true, false]);
    expect(flags[2]!.sentence).toMatch(/kept on this laptop/);
    expect(flags[2]!.next).toMatch(/Settings/);

    // One commit, by the person, holding the README, the gate with the app's public key, the first card.
    expect(git(site.repoDir, 'log', '--format=%an|%s')).toBe(
      'Asha Rao|Start Chai Stall: Track the day’s chai orders and the day’s takings.',
    );
    expect(git(site.repoDir, 'status', '--porcelain')).toBe('');
    const gate = readFileSync(path.join(site.repoDir, '.github/workflows/rama-gate.yml'), 'utf8');
    expect(gate).toContain(
      `PUBLIC_KEY: '${appSealer({ ...process.env, RAMA_WORK_DIR: work }).publicKey}'`,
    );
    expect(gate).not.toContain('RAMA_REF');
    const cards = await listDecisions(conn.db, 'chai-stall');
    expect(cards).toEqual([
      expect.objectContaining({ title: 'Build Chai Stall', status: 'open', by: 'Asha Rao' }),
    ]);
    expect(readFileSync(path.join(site.repoDir, '.rama/decisions.jsonl'), 'utf8')).toContain(
      'Build Chai Stall',
    );
    const [row] = await conn.db.select().from(sites).where(eq(sites.siteId, 'chai-stall'));
    expect(row).toMatchObject({ memberId: asha.id, createdBy: asha.id });
    expect(siteRecord('chai-stall', { RAMA_WORK_DIR: work })).toMatchObject({
      kind: 'product',
      idea: 'Track the day’s chai orders and the day’s takings.',
    });
  });

  it('refuses a product with no name or no idea', async () => {
    const d = deps(stubGitHub());
    await expect(newProduct(conn.db, { name: ' ', idea: 'x', person: asha }, d)).rejects.toThrow(
      /name/,
    );
    await expect(newProduct(conn.db, { name: 'X', idea: ' ', person: asha }, d)).rejects.toThrow(
      /idea/,
    );
  });

  it('Create repository: under the organisation in Settings, the work pushed, the token in no file', async () => {
    await setSecret(conn.db, 'GITHUB_TOKEN', TOKEN, asha.id, path.join(work, '.secret-key'));
    await putSetting(conn.db, GITHUB_OWNER, { owner: 'aayuda' }, asha.id);
    const fetch = stubGitHub();
    const flag = await createProductRepository(conn.db, 'chai-stall', deps(fetch));
    expect(flag).toEqual({
      ok: true,
      sentence: 'The repository aayuda/chai-stall is created and holds the work.',
    });
    const bare = path.join(work, 'github', 'aayuda', 'chai-stall.git');
    const site = path.join(work, 'chai-stall', 'repo');
    expect(git(bare, 'rev-parse', 'main')).toBe(git(site, 'rev-parse', 'HEAD'));
    expect(siteRecord('chai-stall', { RAMA_WORK_DIR: work })!.remote).toBe(
      'https://github.com/aayuda/chai-stall',
    );
    // Asked again, it says where the repository is and creates nothing.
    const again = await createProductRepository(conn.db, 'chai-stall', deps(stubGitHub()));
    expect(again.sentence).toBe('The repository is https://github.com/aayuda/chai-stall.');
    // The token is in no file of the work dir: not the checkout's config, not site.json.
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    for (const f of files(work)) expect(readFileSync(f).includes(TOKEN), f).toBe(false);
  });

  it('a new product goes straight to GitHub when it is set; a name taken there is a grey flag', async () => {
    const { flags } = await newProduct(
      conn.db,
      { name: 'Tiffin', idea: 'Lunch boxes by subscription.', person: asha },
      deps(stubGitHub()),
    );
    expect(flags.at(-1)).toMatchObject({
      ok: true,
      sentence: expect.stringMatching(/aayuda\/tiffin/),
    });
    const { flags: taken } = await newProduct(
      conn.db,
      { name: 'Ledger', idea: 'A shop ledger.', person: asha },
      deps(stubGitHub({ exists: true })),
    );
    expect(taken.at(-1)).toMatchObject({
      ok: false,
      sentence: expect.stringMatching(/already exists there/),
      next: expect.stringMatching(/Create repository/),
    });
  });
});
