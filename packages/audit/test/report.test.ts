// A whole audit against a throwaway database, with the auditor answered by a stand-in that records its
// model_calls row as the real one does: checks, the reply applied, the signed report, the verification.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import { extract } from '@rama/blueprint';
import { createDb, modelCalls, runMigrations, seed } from '@rama/db';
import { sign } from '@rama/ceremony';
import { fixtureRepo, type FixtureRepo } from '../../blueprint/test/fixture-repo.ts';
import { openDecisions, unconfirmedGlossary, unsignedChanges } from '../src/checks/ceremony.ts';
import { auditChecks } from '../src/checks/index.ts';
import { SITE } from '../src/findings.ts';
import { latestAudit, runAudit, verifyReport } from '../src/report.ts';
import type { AuditorReply } from '../src/auditor.ts';

const serverUrl = process.env.DATABASE_URL!;
const dbName = `rama_test_${randomBytes(4).toString('hex')}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
let conn: ReturnType<typeof createDb>;
let memberId: string;
let repo: FixtureRepo;
let bp: Blueprint;
let first: string;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  conn = createDb(Object.assign(new URL(serverUrl), { pathname: `/${dbName}` }).toString());
  await runMigrations(conn.db);
  memberId = (await seed(conn.db, { memberName: 'Asha Rao' })).member.id;
  repo = fixtureRepo();
  repo.write({
    'next.config.mjs': 'export default {};\n',
    'lib/bids.ts':
      'export const spread = (bids: number[]) => { const s = [...bids].sort(); return s[2] - s[0]; };\n',
    'app/page.tsx':
      "import { spread } from '../lib/bids';\nexport default function Home() { return spread([1, 2, 3]); }\n",
    'app/help/page.tsx': 'export default function Help() { return null; }\n',
  });
  first = repo.commit('first');
  repo.write({ 'app/help/page.tsx': 'export default function Help() { return 1; }\n' });
  repo.commit('second');
  bp = extract(repo.dir);
});

afterAll(async () => {
  await conn?.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  repo?.cleanup();
});

const sig = (id: string, screen: string, commit: string): Signoff => ({
  id,
  siteId: 'self',
  person: 'Asha Rao',
  target: { kind: 'screen', id: screen, commit },
  statement: 'ok',
  at: '2026-10-23T00:00:00Z',
});

describe('ceremony checks', () => {
  it('unsigned-change: notes a screen never signed and one changed since its signature, not one signed at HEAD', () => {
    const f = unsignedChanges(repo.dir, bp, [sig('s1', '/', bp.commit), sig('s2', '/help', first)]);
    expect(f.map((x) => [x.brick, x.verdict, x.text])).toEqual([
      [
        'app/help/page.tsx',
        'note',
        `The screen /help changed since Asha Rao signed it at ${first.slice(0, 7)} (app/help/page.tsx).`,
      ],
    ]);
    expect(unsignedChanges(repo.dir, bp, []).map((x) => x.text)).toEqual([
      'The screen / has never been signed.',
      'The screen /help has never been signed.',
    ]);
  });

  it('unconfirmed-glossary: notes the bricks whose import phrases are drafts; confirmed ones are not', () => {
    const edges = [
      {
        from: 'app/page.tsx',
        to: 'lib/bids.ts',
        symbols: ['spread'],
        english: { text: 'asks the bids for the spread', confirmed: false },
      },
      {
        from: 'lib/x.ts',
        to: 'lib/y.ts',
        symbols: [],
        english: { text: 'reads y', confirmed: true },
      },
    ];
    expect(
      unconfirmedGlossary({ ...bp, edges } as Blueprint).map((x) => [x.brick, x.text]),
    ).toEqual([['app/page.tsx', '1 drafted phrase about its imports is not confirmed by anyone.']]);
  });

  it('open-decision: notes open and not-built decisions on their bricks (or the site), not decided or superseded ones', () => {
    const d = (
      id: string,
      status: Decision['status'],
      bricks: string[],
      supersedes?: string,
    ): Decision => ({
      id,
      siteId: 'self',
      title: id,
      statement: 's',
      bricks,
      status,
      by: 'b',
      at: 'a',
      ...(supersedes ? { supersedes } : {}),
    });
    const f = openDecisions(bp, [
      d('who signs', 'open', []),
      d('spread', 'not-built', ['lib/bids.ts']),
      d('done', 'decided', ['lib/bids.ts']),
      d('old', 'open', ['lib/bids.ts']),
      d('new', 'decided', [], 'old'),
    ]);
    expect(f.map((x) => [x.brick, x.text])).toEqual([
      [SITE, 'Decision "who signs" is still open.'],
      ['lib/bids.ts', 'Decision "spread" is decided but not built.'],
    ]);
  });
});

describe('runAudit', () => {
  const answer = (over: Partial<AuditorReply> = {}): AuditorReply => ({
    narration: [
      { part: 'verdict', text: 'One defect: the spread takes the third bid by position.' },
    ],
    alterations: [
      {
        title: 'Generalise the spread',
        agentTime: '15 min',
        humanTime: 'review 15 min',
        kind: 'defect',
        findings: ['F1'],
      },
    ],
    timeMachine: [
      {
        commit: bp.commits[0]!.short,
        what: 'Laid with no test.',
        shouldHave: 'A test of the spread.',
      },
    ],
    verdictChanges: [],
    ...over,
  });
  // Stands in for packages/model: records the model_calls row with exactly what it was given.
  const auditor = (reply: AuditorReply) =>
    (async (req: { input: unknown; siteId: string }) => {
      const [row] = await conn.db
        .insert(modelCalls)
        .values({
          siteId: req.siteId,
          prompt: 'audit',
          promptVersion: 1,
          promptHash: 'h',
          role: 'auditor',
          vendor: 'openai',
          model: 'gpt-test',
          input: req.input as object,
          status: 'ok',
          attempts: 1,
          ms: 1,
          createdBy: 'rama:audit@0.1.0',
        })
        .returning({ id: modelCalls.id });
      return {
        output: reply,
        callId: row!.id,
        vendor: 'openai',
        model: 'gpt-test',
        attempts: 1,
        inputTokens: 1,
        outputTokens: 1,
      };
    }) as never;

  it('writes a signed report and every brick verdict, which verify against the auditor own call', async () => {
    await sign(
      conn.db,
      { id: 'self', repoDir: repo.dir },
      {
        person: 'Asha Rao',
        personId: memberId,
        target: { kind: 'screen', id: '/', commit: bp.commit },
        statement: 'ok',
        at: new Date(),
      },
    );
    const { report, body } = await runAudit(conn.db, {
      siteId: 'self',
      name: 'Shop',
      repoDir: repo.dir,
      bp,
      formulaFiles: [],
      run: false,
      call: auditor(answer()),
    });
    expect(report).toMatchObject({
      vendor: 'openai',
      model: 'gpt-test',
      inputsHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(body.counts).toMatchObject({ defects: 1, bricks: bp.nodes.length });
    expect(body.worktree).toBeUndefined();
    expect(body.runs.filter((r) => !r.ran).map((r) => r.check)).toEqual([
      'typecheck',
      'build',
      'test-coverage-per-brick',
    ]);
    // The signed screen holds the defective brick: the audit rejects that sign-off, by plain code.
    expect(body.signoffs).toEqual([
      {
        screen: '/',
        person: 'Asha Rao',
        commit: bp.commit,
        confirmed: false,
        defects: ['lib/bids.ts'],
      },
    ]);
    const stored = (await latestAudit(conn.db, 'self'))!;
    expect(stored.report).toEqual(report);
    expect(stored.findings.find((f) => f.brick === 'lib/bids.ts')).toMatchObject({
      check: 'positional-assumption',
      verdict: 'defect',
      line: 1,
    });
    expect(stored.findings.filter((f) => f.verdict === 'pass').map((f) => f.brick)).toContain(
      'next.config.mjs',
    );
    expect(await verifyReport(conn.db, report)).toEqual({ ok: true });
    expect(await verifyReport(conn.db, { ...report, inputsHash: '0'.repeat(64) })).toEqual({
      ok: false,
      why: 'what the auditor received does not hash to the report',
    });
    const audited =
      await conn.sql`select table_name from audit_log where table_name in ('audits', 'findings')`;
    expect(audited.filter((r) => r.table_name === 'audits')).toHaveLength(1);
  });

  it('keeps a downgraded verdict with the checks own verdict beside it, and stores nothing when the auditor overreaches', async () => {
    const { body } = await runAudit(conn.db, {
      siteId: 'self',
      name: 'Shop',
      repoDir: repo.dir,
      bp,
      formulaFiles: [],
      run: false,
      call: auditor(
        answer({ verdictChanges: [{ finding: 'F1', to: 'note', why: 'Three bids by contract.' }] }),
      ),
    });
    expect(body.counts.defects).toBe(0);
    const stored = (await latestAudit(conn.db, 'self'))!;
    expect(stored.findings.find((f) => f.brick === 'lib/bids.ts')).toMatchObject({
      verdict: 'note',
      checkVerdict: 'defect',
      auditorNote: 'Three bids by contract.',
    });
    const before = (await conn.sql`select count(*)::int as n from audits`)[0]!.n;
    await expect(
      runAudit(conn.db, {
        siteId: 'self',
        name: 'Shop',
        repoDir: repo.dir,
        bp,
        formulaFiles: [],
        run: false,
        call: auditor(answer({ verdictChanges: [{ finding: 'F404', to: 'note', why: 'x' }] })),
      }),
    ).rejects.toThrow(/did not make/);
    expect((await conn.sql`select count(*)::int as n from audits`)[0]!.n).toBe(before);
  });

  it('checks the same commit to the same findings every time', () => {
    const ctx = {
      repoDir: repo.dir,
      bp,
      signoffs: [],
      decisions: [],
      formulaFiles: ['lib/bids.ts'],
      run: false as const,
    };
    expect(auditChecks(ctx)).toEqual(auditChecks(ctx));
  });
});
