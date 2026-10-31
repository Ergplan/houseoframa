// The ground, opened (Stage 11), against a real Postgres server: a product's sandbox database is made
// from its own Drizzle tables under a login of its own; its rows are read newest first, 50 at a time,
// counted in their own unit, secrets masked, and only ever read-only. An outside site without an address
// in Settings says "Rows not connected".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import type { Table } from '@rama/shared';
import { createDb, runMigrations, setSiteDatabase } from '@rama/db';
import type { Capture } from '@rama/trace';
import {
  countSentence,
  dropSandboxes,
  ensureSandbox,
  groundTable,
  MASK,
  maskedColumn,
  readOnly,
  readRows,
  rowsSource,
  sandboxDdl,
  sandboxName,
  sandboxUrl,
} from '../src/ground.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const dbUrl = Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString();
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let work: string;
let repo: string;
let env: NodeJS.ProcessEnv;

const SCHEMA = `import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
const provenance = () => ({
  siteId: text('site_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  ...provenance(),
  item: text('item').notNull(),
  cups: integer('cups').notNull(),
  apiKey: text('api_key'),
});
`;
// The orders table as the Blueprint reads it (packages/blueprint parse).
const field = (name: string, type: string, over = {}) => ({
  key: name,
  name,
  type,
  primary: false,
  notNull: true,
  unique: false,
  secret: false,
  ...over,
});
const orders: Table = {
  name: 'orders',
  file: 'db/schema.ts',
  line: 6,
  symbol: 'orders',
  columns: ['id', 'item', 'cups', 'apiKey'],
  fields: [
    field('id', 'serial', { primary: true }),
    field('site_id', 'text', { key: 'siteId', from: 'provenance' }),
    field('created_at', 'timestamp', { key: 'createdAt', from: 'provenance' }),
    field('item', 'text'),
    field('cups', 'integer'),
    field('api_key', 'text', { key: 'apiKey', notNull: false }),
  ],
};
const site = () => ({ id: 'chai-stall', kind: 'product' as const, repoDir: repo });

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const c = createDb(dbUrl);
  await runMigrations(c.db);
  await c.close();
  work = mkdtempSync(path.join(tmpdir(), 'rama-ground-'));
  repo = path.join(work, 'repo');
  mkdirSync(path.join(repo, 'db'), { recursive: true });
  mkdirSync(path.join(repo, 'node_modules'));
  writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
  writeFileSync(path.join(repo, 'db/schema.ts'), SCHEMA);
  // The product's own drizzle-orm: the one House of Rama installs for it.
  symlinkSync(
    path.resolve(import.meta.dirname, '../node_modules/drizzle-orm'),
    path.join(repo, 'node_modules/drizzle-orm'),
  );
  env = { ...process.env, DATABASE_URL: dbUrl, RAMA_WORK_DIR: path.join(work, 'work') };
});

afterAll(async () => {
  if (env) await dropSandboxes(env);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  rmSync(work, { recursive: true, force: true });
});

describe('the sandbox database of a product built here', () => {
  it('is named for this House of Rama and the site, never longer than Postgres allows', () => {
    expect(sandboxName('chai-stall', env)).toBe(`${dbName}_sbx_chai_stall`);
    expect(sandboxName('x'.repeat(80), env).length).toBeLessThanOrEqual(63);
    const u = new URL(sandboxUrl('chai-stall', env));
    expect([u.username, u.pathname]).toEqual([
      sandboxName('chai-stall', env),
      `/${sandboxName('chai-stall', env)}`,
    ]);
    // Its password is the app key's, derived, never House of Rama's own login.
    expect(u.password).not.toBe(new URL(dbUrl).password);
  });

  it('writes the tables as the product’s own Drizzle describes them, keeping rows, never dropping', () => {
    const ddl = sandboxDdl([
      {
        name: 'lines',
        columns: [
          {
            name: 'bill',
            type: 'integer',
            primary: false,
            notNull: true,
            unique: false,
            default: null,
          },
          {
            name: 'n',
            type: 'integer',
            primary: false,
            notNull: true,
            unique: false,
            default: null,
          },
          {
            name: 'at',
            type: 'timestamp with time zone',
            primary: false,
            notNull: true,
            unique: false,
            default: 'now()',
          },
        ],
        primaryKey: ['bill', 'n'],
      },
    ]);
    expect(ddl[0]).toBe(
      'CREATE TABLE IF NOT EXISTS "lines" ("bill" integer NOT NULL, "n" integer NOT NULL, "at" timestamp with time zone NOT NULL DEFAULT now(), PRIMARY KEY ("bill", "n"))',
    );
    expect(ddl.slice(1)).toEqual([
      'ALTER TABLE "lines" ADD COLUMN IF NOT EXISTS "bill" integer NOT NULL',
      'ALTER TABLE "lines" ADD COLUMN IF NOT EXISTS "n" integer NOT NULL',
      'ALTER TABLE "lines" ADD COLUMN IF NOT EXISTS "at" timestamp with time zone NOT NULL DEFAULT now()',
    ]);
    expect(ddl.join(' ')).not.toMatch(/DROP/);
  });

  it('is made by the build loop, holds the product’s tables, and the product writes to it as itself', async () => {
    const made = await ensureSandbox(site(), { tables: [orders] }, env);
    expect(made.sentence).toBe('The product’s own database holds 1 table: orders.');
    expect(made.url).toBe(sandboxUrl('chai-stall', env));
    // Made again: nothing lost.
    const w = postgres(made.url!, { max: 1, onnotice: () => {} });
    await w`insert into orders (site_id, item, cups) values ('chai-stall', 'Masala chai', 2)`;
    expect((await ensureSandbox(site(), { tables: [orders] }, env)).url).toBe(made.url);
    expect((await w`select count(*)::int as n from orders`)[0]!.n).toBe(1);
    await w.end();
    // Its login reaches only its own records: House of Rama's are not its to read.
    const own = new URL(made.url!);
    const into = postgres(Object.assign(own, { pathname: `/${dbName}` }).toString(), {
      max: 1,
      onnotice: () => {},
    });
    await expect(into`select count(*) from secrets`).rejects.toThrow(/permission denied/);
    await into.end().catch(() => {});
    expect(await rowsSource(site(), null as never, env)).toEqual({
      kind: 'sandbox',
      url: made.url,
    });
  });
});

describe('the rows of a plot', () => {
  beforeAll(async () => {
    const w = postgres(sandboxUrl('chai-stall', env), { max: 1, onnotice: () => {} });
    await w`delete from orders`;
    // 60 orders: 55 two days ago (so none falls into today, whatever the hour the test runs), then 5
    // today, each with a key in it that must never be shown.
    for (let i = 0; i < 60; i++)
      await w`insert into orders (site_id, item, cups, api_key, created_at)
        values ('chai-stall', ${`Chai ${i}`}, ${(i % 3) + 1}, ${i % 2 ? `sk-${i}` : null},
          ${i < 55 ? w`now() - interval '2 days' + ${`${i} minutes`}::interval` : w`now() - ${`${60 - i} seconds`}::interval`})`;
    await w.end();
  });

  it('reads 50 at a time, newest first, and counts in the table’s own unit', async () => {
    const r = await readRows(sandboxUrl('chai-stall', env), orders);
    if ('absent' in r) throw new Error('the table is there');
    expect(r.columns).toEqual(['id', 'site_id', 'created_at', 'item', 'cups', 'api_key']);
    expect(r.rows).toHaveLength(50);
    expect(r.rows[0]![3]).toBe('Chai 59');
    expect(r.rows[49]![3]).toBe('Chai 10');
    expect([r.total, r.today, r.more, r.order]).toEqual([
      60,
      5,
      true,
      'newest first, by when each was written',
    ]);
    expect(countSentence('orders', r.total, r.today)).toBe('5 orders today · 60 in all');
    const more = await readRows(sandboxUrl('chai-stall', env), orders, 50);
    if ('absent' in more) throw new Error('the table is there');
    expect(more.rows.map((x) => x[3])).toEqual(
      Array.from({ length: 10 }, (_, i) => `Chai ${9 - i}`),
    );
    expect(more.more).toBe(false);
  });

  it('shows a value as the table holds it, and masks a key: never sent, only whether it is empty', async () => {
    const r = await readRows(sandboxUrl('chai-stall', env), orders);
    if ('absent' in r) throw new Error('the table is there');
    const keys = r.rows.map((x) => x[5]);
    expect(new Set(keys)).toEqual(new Set([MASK, null]));
    expect(JSON.stringify(r)).not.toMatch(/sk-\d/);
    expect(r.rows[0]![4]).toMatch(/^[123]$/);
    expect(r.rows[0]![2]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/);
    expect(maskedColumn({ name: 'password_hash', key: 'passwordHash', secret: false })).toBe(true);
    expect(maskedColumn({ name: 'note', key: 'note', secret: true })).toBe(true);
    expect(maskedColumn({ name: 'cups', key: 'cups', secret: false })).toBe(false);
  });

  it('says which columns of the code the database does not hold, and when the table is not there', async () => {
    const more = { ...orders, fields: [...orders.fields!, field('price', 'integer')] };
    const r = await readRows(sandboxUrl('chai-stall', env), more);
    expect('absent' in r ? null : r.missing).toEqual(['price']);
    expect(await readRows(sandboxUrl('chai-stall', env), { ...orders, name: 'bills' })).toEqual({
      absent: true,
    });
  });

  it('is read-only at the connection: a write through it is refused, and nothing changes', async () => {
    await expect(
      readOnly(sandboxUrl('chai-stall', env), (tx) => tx`delete from orders`),
    ).rejects.toThrow(/read-only transaction/);
    const r = await readRows(sandboxUrl('chai-stall', env), orders);
    expect('absent' in r ? 0 : r.total).toBe(60);
  });
});

describe('an outside site', () => {
  it('says "Rows not connected" until a database address is entered in Settings', async () => {
    const c = createDb(dbUrl);
    try {
      const outside = { id: 'ekbill', kind: 'outside' as const };
      const none = await rowsSource(outside, c.db, env);
      expect(none).toEqual({ kind: 'none', why: expect.stringMatching(/^Rows not connected/) });
      const url = sandboxUrl('chai-stall', env);
      await setSiteDatabase(c.db, 'ekbill', url, 'Tara', path.join(work, 'work/.secret-key'));
      expect(await rowsSource(outside, c.db, env)).toEqual({ kind: 'settings', url });
    } finally {
      await c.close();
    }
  });

  it('a product whose sandbox is not made yet says when it will be', async () => {
    const r = await rowsSource({ id: 'not-made', kind: 'product' }, null as never, env);
    expect(r).toEqual({ kind: 'none', why: expect.stringMatching(/photographed/) });
  });
});

describe('what a plot shows besides its rows', () => {
  it('marks the columns a figure on a screen is worked out from, with the figure’s flow', () => {
    const capture = {
      commit: 'c1',
      screens: [
        {
          name: 'todays-orders',
          blueprintScreen: 'todays-orders',
          figures: [{ id: 'order-amount' }, { id: 'order-amount' }],
        },
      ],
      mappings: {
        'order-amount': {
          title: 'Order amount',
          inputs: [
            { label: 'Cups', data: 'orders.cups' },
            { label: 'Price', data: 'orders.price_of_cup' },
          ],
        },
      },
    } as unknown as Capture;
    const st = {
      plots: [{ table: 'orders', readBy: ['see'], writtenBy: [] }],
      buildings: [
        { id: 'see', name: 'See today’s orders', facades: [{ screen: 'todays-orders' }] },
      ],
    } as never;
    const g = groundTable(
      { repoDir: repo },
      { tables: [orders], commit: 'c1' },
      st,
      'orders',
      capture,
    )!;
    expect(g.readBy).toEqual([{ id: 'see', name: 'See today’s orders' }]);
    expect(g.columns.find((c) => c.name === 'cups')!.figures).toEqual([
      { key: 'todays-orders/order-amount', title: 'Order amount', building: 'see' },
      { key: 'todays-orders/order-amount~2', title: 'Order amount', building: 'see' },
    ]);
    expect(g.columns.find((c) => c.name === 'item')!.figures).toEqual([]);
    expect(g.columns.find((c) => c.name === 'api_key')!.masked).toBe(true);
    // A capture of another commit says nothing about this one.
    const old = groundTable(
      { repoDir: repo },
      { tables: [orders], commit: 'c2' },
      st,
      'orders',
      capture,
    )!;
    expect(old.columns.every((c) => c.figures.length === 0)).toBe(true);
  });
});
