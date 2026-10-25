// The auditor explains and downgrades; it never adds a finding or raises one (MASTER-PROMPT Stage 5).
import { describe, expect, it, vi } from 'vitest';
import type { Blueprint } from '@rama/shared';
import { call as realCall, VendorGuardError } from '@rama/model';
import {
  applyReply,
  askAuditor,
  AuditorOverreachError,
  AuditorReply,
  inputsHash,
  number,
  type AuditorInput,
} from '../src/auditor.ts';
import type { CheckFinding } from '../src/findings.ts';

const bp = { commits: [{ sha: 'abc1234def', short: 'abc1234' }] } as unknown as Blueprint;
const checks: CheckFinding[] = [
  {
    brick: 'lib/a.ts',
    check: 'positional-assumption',
    verdict: 'defect',
    text: 'Takes item 2.',
    file: 'lib/a.ts',
    line: 3,
  },
  { brick: 'lib/b.ts', check: 'any-type', verdict: 'note', text: 'any', file: 'lib/b.ts', line: 1 },
];
const all = number(checks);
const reply = (over: Partial<AuditorReply> = {}): AuditorReply => ({
  narration: [{ part: 'verdict', text: 'One defect.' }],
  alterations: [
    {
      title: 'Generalise the spread',
      agentTime: '15 min',
      humanTime: 'review 15 min',
      kind: 'defect',
      findings: ['F1'],
    },
  ],
  timeMachine: [{ commit: 'abc1234', what: 'Laid without a test.', shouldHave: 'A test.' }],
  verdictChanges: [],
  ...over,
});

describe('the model may not add a defect the checks did not find', () => {
  it('keeps the checks verdicts, and lowers one only with a reason', () => {
    const out = applyReply(
      all,
      reply({
        alterations: [
          {
            title: 'Name the three-bid rule',
            agentTime: '10 min',
            humanTime: 'committee 15 min',
            kind: 'note',
            findings: ['F1'],
          },
        ],
        verdictChanges: [{ finding: 'F1', to: 'note', why: 'Only ever three bids, by contract.' }],
      }),
      bp,
    );
    expect(out.map((f) => [f.id, f.checkVerdict, f.finalVerdict, f.auditorNote])).toEqual([
      ['F1', 'defect', 'note', 'Only ever three bids, by contract.'],
      ['F2', 'note', 'note', undefined],
    ]);
  });

  it('refuses a reply that raises a verdict, names a finding the checks did not make, or cites one in an alteration', () => {
    expect(() =>
      applyReply(all, reply({ verdictChanges: [{ finding: 'F2', to: 'note', why: 'same' }] }), bp),
    ).toThrow(AuditorOverreachError);
    expect(() =>
      applyReply(all, reply({ verdictChanges: [{ finding: 'F99', to: 'note', why: 'new' }] }), bp),
    ).toThrow(/did not make/);
    expect(() =>
      applyReply(
        all,
        reply({
          alterations: [
            { title: 'x', agentTime: '1 h', humanTime: '-', kind: 'defect', findings: ['F7'] },
          ],
        }),
        bp,
      ),
    ).toThrow(/did not make/);
    expect(() =>
      applyReply(
        all,
        reply({ timeMachine: [{ commit: 'fffffff', what: 'x', shouldHave: 'y' }] }),
        bp,
      ),
    ).toThrow(/not in the history/);
    // A defect-labelled alteration must stand on a defect the checks found and the auditor did not lower.
    const defectWithout = (findings: string[], changes: AuditorReply['verdictChanges'] = []) =>
      reply({
        alterations: [{ title: 'x', agentTime: '1 h', humanTime: '-', kind: 'defect', findings }],
        verdictChanges: changes,
      });
    expect(() => applyReply(all, defectWithout([]), bp)).toThrow(/cites no defect/);
    expect(() => applyReply(all, defectWithout(['F2']), bp)).toThrow(/cites no defect/);
    expect(() =>
      applyReply(
        all,
        defectWithout(['F1'], [{ finding: 'F1', to: 'note', why: 'by contract' }]),
        bp,
      ),
    ).toThrow(/cites no defect/);
    expect(() => applyReply(all, defectWithout(['F1', 'F2']), bp)).not.toThrow();
  });

  it('has no field to add a finding: a reply that tries is not a valid reply', () => {
    const tries = {
      ...reply(),
      findings: [{ brick: 'lib/c.ts', verdict: 'defect', text: 'invented' }],
    };
    expect(AuditorReply.safeParse(tries).success).toBe(false);
    const raise = { ...reply(), verdictChanges: [{ finding: 'F2', to: 'defect', why: 'worse' }] };
    expect(AuditorReply.safeParse(raise).success).toBe(false);
  });
});

describe('inputsHash', () => {
  const input = {
    site: 's',
    commit: 'abc',
    floors: [],
    runs: [],
    defects: all.slice(0, 1),
    notes: [],
    notesByCheck: {},
    screens: [],
    decisions: [],
    commits: [],
    builders: ['A'],
    totals: {
      bricks: 0,
      defects: 0,
      notes: 0,
      screens: 0,
      screensSigned: 0,
      decisions: { decided: 0, open: 0, notBuilt: 0, reconstructed: 0 },
    },
  } as AuditorInput;
  it('is the same for the same inputs, whatever the key order, and changes with any input', () => {
    const reordered = Object.fromEntries(
      Object.entries(input).reverse(),
    ) as unknown as AuditorInput;
    expect(inputsHash(reordered)).toBe(inputsHash(input));
    expect(inputsHash(input)).toMatch(/^[0-9a-f]{64}$/);
    expect(inputsHash({ ...input, builders: ['B'] })).not.toBe(inputsHash(input));
  });
});

describe('askAuditor', () => {
  const input = {
    site: 's',
    commit: 'abc1234def',
    floors: [],
    runs: [],
    defects: [],
    notes: [],
    notesByCheck: {},
    screens: [],
    decisions: [],
    commits: [],
    builders: [],
    totals: {
      bricks: 0,
      defects: 0,
      notes: 0,
      screens: 0,
      screensSigned: 0,
      decisions: { decided: 0, open: 0, notBuilt: 0, reconstructed: 0 },
    },
  } as AuditorInput;

  it('asks the auditor role with prompt audit.v1', async () => {
    const call = vi.fn(async () => ({
      output: reply({ alterations: [], verdictChanges: [] }),
      callId: 'c1',
      vendor: 'openai',
      model: 'm',
      attempts: 1,
      inputTokens: 1,
      outputTokens: 1,
    }));
    const r = await askAuditor(input, all, bp, { siteId: 'self', call: call as never });
    expect((call.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
      name: 'audit',
      version: 1,
      role: 'auditor',
      siteId: 'self',
    });
    expect(r).toMatchObject({ callId: 'c1', vendor: 'openai', inputsHash: inputsHash(input) });
  });

  it('is refused before any vendor call when the auditor would be the builder (Invariant 5)', async () => {
    const fetch = vi.fn();
    const guarded = ((req: Parameters<typeof realCall>[0]) =>
      realCall(req, {
        env: { BUILDER_VENDOR: 'openai', AUDITOR_VENDOR: 'openai' },
        fetch: fetch as never,
        record: vi.fn() as never,
      })) as typeof realCall;
    await expect(askAuditor(input, all, bp, { siteId: 'self', call: guarded })).rejects.toThrow(
      VendorGuardError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is refused before any vendor call when the auditor’s company built the product, whatever the seats say', async () => {
    const fetch = vi.fn();
    const record = vi.fn();
    // The seats stand (Anthropic builds, OpenAI checks), but OpenAI's builder built this product.
    const call = ((req: Parameters<typeof realCall>[0]) =>
      realCall(req, {
        env: { BUILDER_VENDOR: 'anthropic', AUDITOR_VENDOR: 'openai', OPENAI_MODEL: 'm' },
        secret: async () => 'k',
        fetch: fetch as never,
        record: record as never,
      })) as typeof realCall;
    await expect(
      askAuditor(input, all, bp, { siteId: 'self', call, notVendors: ['openai'] }),
    ).rejects.toThrow(/OpenAI may not answer this call: its builder built what is being checked/);
    expect(fetch).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
