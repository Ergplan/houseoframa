import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDb, modelCalls, runMigrations, seed, audits, findings } from '@rama/db';
import { confirmReport, inputsHash, type AuditorInput } from '@rama/audit';
import AuditReport from './page';

// The confirm button refreshes through the App Router, which a static render does not mount.
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => {} }),
}));

const params = (siteId: string) => ({ params: Promise.resolve({ siteId }) });
const serverUrl = process.env.DATABASE_URL!;
const original = process.env.DATABASE_URL;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
const input = { site: 'House of Rama', commit: 'abc1234def' } as unknown as AuditorInput;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL = Object.assign(new URL(serverUrl), {
    pathname: `/${dbName}`,
  }).toString();
  const conn = createDb();
  await runMigrations(conn.db);
  await seed(conn.db, { memberName: 'Asha Rao' });
  await conn.close();
});

afterAll(async () => {
  process.env.DATABASE_URL = original;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

describe('route /site/[siteId]/audit', () => {
  it('says there is no audit yet rather than showing an empty report', async () => {
    expect(renderToStaticMarkup(await AuditReport(params('self')))).toContain(
      'No audit of this site yet.',
    );
  });

  it('shows the signed report, verified against what the auditor received, with checks, sign-offs and findings', async () => {
    const conn = createDb();
    try {
      const [call] = await conn.db
        .insert(modelCalls)
        .values({
          siteId: 'self',
          prompt: 'audit',
          promptVersion: 1,
          promptHash: 'h',
          role: 'auditor',
          vendor: 'openai',
          model: 'gpt-x',
          input: input as object,
          status: 'ok',
          attempts: 1,
          ms: 1,
          createdBy: 'rama:audit@0.1.0',
        })
        .returning();
      const body = {
        runs: [{ check: 'build', ran: false, detail: 'no `build` script' }],
        counts: { defects: 1, notes: 0, passes: 4, bricks: 5 },
        narration: [{ part: 'verdict', text: 'One defect on the logic floor.' }],
        alterations: [
          {
            title: 'Generalise the spread',
            agentTime: '15 min',
            humanTime: 'review 15 min',
            kind: 'defect',
            findings: ['F1'],
          },
        ],
        timeMachine: [],
        verdictChanges: [],
        signoffs: [
          {
            screen: '/',
            person: 'Asha Rao',
            commit: 'abc1234def',
            confirmed: false,
            defects: ['lib/bids.ts'],
          },
        ],
        builders: ['Asha Rao'],
      };
      const [a] = await conn.db
        .insert(audits)
        .values({
          siteId: 'self',
          commit: 'abc1234def',
          vendor: 'openai',
          model: 'gpt-x',
          callId: call!.id,
          inputsHash: inputsHash(input),
          at: new Date('2026-10-23T18:00:00Z'),
          report: body,
          createdBy: 'rama:audit@0.1.0',
        })
        .returning();
      await conn.db.insert(findings).values({
        siteId: 'self',
        auditId: a!.id,
        brick: 'lib/bids.ts',
        check: 'positional-assumption',
        verdict: 'defect',
        checkVerdict: 'defect',
        text: 'Takes item 2 of a sorted list.',
        line: 3,
        createdBy: 'rama:audit@0.1.0',
      });
    } finally {
      await conn.close();
    }
    const html = renderToStaticMarkup(await AuditReport(params('self')));
    expect(html).toContain('data-verified="true"');
    expect(html).toMatch(/Signed by <b>openai<\/b> <code>gpt-x<\/code>/);
    expect(html).toContain('<b>not run: no `build` script</b>');
    expect(html).toContain('1 defect, 0 notes, 4 clean bricks of');
    expect(html).toContain('Rejected');
    expect(html).toContain('Takes item 2 of a sorted list.');
    expect(html).toContain('One defect on the logic floor.');
    // The auditor's words are drafted text: unconfirmed until a named person confirms them (Invariant 6).
    expect(html).toContain('data-draft="unconfirmed"');
    process.env.RAMA_MEMBER_NAME = 'Asha Rao';
    expect(renderToStaticMarkup(await AuditReport(params('self')))).toContain(
      'confirm it as Asha Rao</button>',
    );
    const again = createDb();
    try {
      const [a] = await again.sql`select id from audits limit 1`;
      const [p] = await again.sql`select id from people where name = 'Asha Rao'`;
      await confirmReport(again.db, {
        siteId: 'self',
        reportId: a!.id,
        person: 'Asha Rao',
        personId: p!.id,
        at: new Date('2026-10-23T19:00:00Z'),
      });
      await expect(
        confirmReport(again.db, {
          siteId: 'other',
          reportId: a!.id,
          person: 'Asha Rao',
          personId: p!.id,
          at: new Date(),
        }),
      ).rejects.toThrow(/no audit report/);
    } finally {
      await again.close();
    }
    const confirmed = renderToStaticMarkup(await AuditReport(params('self')));
    const pill = /data-draft="confirmed">([^]*?)<\/span>/
      .exec(confirmed)![1]!
      .replace(/<!-- -->/g, '');
    expect(pill).toBe('drafted by openai gpt-x; confirmed by Asha Rao, 2026-10-23');
    expect(confirmed).not.toContain('confirm it as');
  });

  it('is not found for an unknown site', async () => {
    await expect(AuditReport(params('nope'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
