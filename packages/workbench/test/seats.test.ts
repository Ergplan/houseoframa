// The seats of a product (Stage 9): its own choice wins over Settings, which wins over the setup file;
// a choice is recorded as a card decided by the person; and the company of a builder that built the
// product never audits it, even when the seats are changed afterwards (Invariant 5).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createProductSite, updateSiteRecord, type SiteLocation } from '@rama/blueprint/site';
import { listDecisions } from '@rama/ceremony';
import { createDb, ensurePerson, runMigrations, sites, type Db, type Member } from '@rama/db';
import type { Seats } from '@rama/model';
import { callAudit } from '../src/actions.ts';
import { StepError } from '../src/jobs.ts';
import {
  builtByProblems,
  chooseDefaultSeats,
  chooseProductSeats,
  productBuilder,
  seatsOf,
} from '../src/seats.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;
let tara: Member;

const withDb = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const c = createDb(dbUrl);
  try {
    return await fn(c.db);
  } finally {
    await c.close();
  }
};

const seats = (builder: [string, string], auditor: string): Seats => ({
  builder: { vendor: builder[1], model: 'm', builder: builder[0] },
  auditor: { vendor: auditor, model: 'a' },
  drafter: { vendor: 'anthropic', model: 'claude-sonnet-5-5' },
  voice: { vendor: 'openai', model: 'gpt-realtime' },
});

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  await withDb((db) => runMigrations(db));
  work = mkdtempSync(path.join(tmpdir(), 'rama-seats-'));
  env = {
    ...process.env,
    RAMA_WORK_DIR: work,
    BUILDER_VENDOR: 'anthropic',
    AUDITOR_VENDOR: 'openai',
    OPENAI_MODEL: 'gpt-6.1-sol',
    OPENAI_API_KEY: 'sk-test-not-used',
  };
  site = createProductSite({ id: 'chai', name: 'Chai', idea: 'Chai.', env }, (repoDir) =>
    execFileSync('git', ['-C', repoDir, 'init', '--quiet']),
  );
  tara = await withDb((db) => ensurePerson(db, { name: 'Tara', role: 'trainer' }, 'rama:test@0'));
  await withDb((db) =>
    db.insert(sites).values({
      siteId: 'chai',
      name: 'Chai',
      repo: 'chai',
      memberId: tara.id,
      createdBy: tara.id,
    }),
  );
});

afterAll(async () => {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('a product’s seats', () => {
  it('come from the setup file, then Settings, then the product’s own answer, recorded as a card', async () => {
    expect((await withDb((db) => seatsOf(db, 'chai', env))).from).toBe('setup file');
    expect(
      await withDb((db) =>
        chooseDefaultSeats(db, seats(['claude-code', 'anthropic'], 'gemini'), tara),
      ),
    ).toEqual([]);
    expect(await withDb((db) => seatsOf(db, 'chai', env))).toMatchObject({
      from: 'settings',
      seats: { auditor: { vendor: 'gemini' } },
    });
    expect(
      await withDb((db) =>
        chooseProductSeats(
          db,
          site,
          seats(['claude-code', 'anthropic'], 'openai'),
          tara,
          new Date(),
          env,
        ),
      ),
    ).toEqual([]);
    expect(await withDb((db) => seatsOf(db, 'chai', env))).toMatchObject({
      from: 'product',
      seats: { auditor: { vendor: 'openai' } },
    });
    const cards = await withDb((db) => listDecisions(db, 'chai'));
    expect(cards.map((c) => [c.title, c.status, c.by])).toEqual([
      ['The brains', 'decided', 'Tara'],
    ]);
    expect(cards[0]!.statement).toBe(
      'Claude Code (Anthropic, m) builds; OpenAI (a) checks; Anthropic (claude-sonnet-5-5) drafts; OpenAI (gpt-realtime) speaks. The checker is never the builder.',
    );
    expect((await productBuilder(withDb, site, env)).id).toBe('claude-code');
  });

  it('never lets the company of a builder that built it audit it, even after the seats change', async () => {
    updateSiteRecord('chai', { builder: 'claude-code', builtBy: ['claude-code'] }, env);
    const switched = seats(['codex', 'openai'], 'anthropic');
    // The seats alone stand: Codex builds, Anthropic would check.
    expect(await withDb((db) => chooseDefaultSeats(db, switched, tara))).toEqual([]);
    const why =
      'The auditor cannot be Anthropic: Claude Code built this product, and the checker is never the builder (Invariant 5).';
    expect(builtByProblems('chai', 'anthropic', env)).toEqual([why]);
    // The product's own answer is refused, and so is the audit, before any auditor is called.
    expect(
      await withDb((db) => chooseProductSeats(db, site, switched, tara, new Date(), env)),
    ).toEqual([why]);
    await withDb(async (db) => {
      const { putSetting } = await import('@rama/db');
      await putSetting(db, 'brains:chai', switched, tara.id);
      const audit = callAudit(db, site, { env });
      await expect(audit).rejects.toBeInstanceOf(StepError);
      await expect(audit).rejects.toThrow(why);
    });
    // A stub builder in the seat: the build stops at once, saying so.
    expect((await productBuilder(withDb, site, env)).wired).toBe(false);
  });
});
