import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { call, OutputTruncatedError, type CallDeps, type ModelCallRow } from './call.ts';
import { resolveVendors, VendorGuardError } from './vendors.ts';

const promptsDir = fileURLToPath(new URL('../test/fixtures/prompts', import.meta.url));
const baseEnv = {
  BUILDER_VENDOR: 'anthropic',
  AUDITOR_VENDOR: 'openai',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_MODEL: 'test-openai-model',
};
const request = {
  name: 'echo',
  version: 1,
  input: { word: 'brick' },
  output: z.object({ echo: z.string() }),
  siteId: 'self',
  createdBy: 'rama:test@0',
};

function anthropicReply(text: string) {
  return new Response(
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 11, output_tokens: 7 },
    }),
    { status: 200 },
  );
}

function openaiReply(text: string, finishReason = 'stop') {
  return new Response(
    JSON.stringify({
      model: 'test-openai-model',
      choices: [{ message: { content: text }, finish_reason: finishReason }],
      usage: { prompt_tokens: 13, completion_tokens: 5 },
    }),
    { status: 200 },
  );
}

function deps(fetchImpl: CallDeps['fetch'], env: Record<string, string | undefined> = baseEnv) {
  const rows: ModelCallRow[] = [];
  const d: Partial<CallDeps> = {
    env,
    fetch: fetchImpl,
    promptsDir,
    sleep: async () => {},
    record: async (row) => {
      rows.push(row);
      return `row-${rows.length}`;
    },
  };
  return { d, rows };
}

describe('vendor guard (Invariant 5)', () => {
  it('refuses when AUDITOR_VENDOR === BUILDER_VENDOR, before any prompt, vendor call or row', async () => {
    const fetchImpl = vi.fn();
    const { d, rows } = deps(fetchImpl as unknown as CallDeps['fetch'], {
      ...baseEnv,
      AUDITOR_VENDOR: 'anthropic',
    });
    for (const role of ['builder', 'auditor'] as const) {
      await expect(call({ ...request, role }, d)).rejects.toThrow(VendorGuardError);
    }
    await expect(call({ ...request, role: 'auditor' }, d)).rejects.toThrow(/Invariant 5/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('refuses when a vendor is missing or unknown', () => {
    expect(() => resolveVendors({ BUILDER_VENDOR: 'anthropic' })).toThrow(
      /AUDITOR_VENDOR is not set/,
    );
    expect(() => resolveVendors({ BUILDER_VENDOR: 'acme', AUDITOR_VENDOR: 'openai' })).toThrow(
      /not a known vendor/,
    );
  });

  it('accepts two different vendors', () => {
    expect(resolveVendors(baseEnv)).toEqual({ builder: 'anthropic', auditor: 'openai' });
  });
});

describe('call()', () => {
  it('routes the builder role to BUILDER_VENDOR and returns typed output with one row', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => anthropicReply('{"echo":"brick"}'));
    const { d, rows } = deps(fetchImpl);
    const res = await call({ ...request, role: 'builder' }, d);
    expect(res.output).toEqual({ echo: 'brick' });
    expect(res.vendor).toBe('anthropic');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      prompt: 'echo',
      promptVersion: 1,
      role: 'builder',
      vendor: 'anthropic',
      status: 'ok',
      attempts: 1,
      inputTokens: 11,
      outputTokens: 7,
      siteId: 'self',
      createdBy: 'rama:test@0',
    });
    expect(rows[0]?.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('routes the auditor role to AUDITOR_VENDOR', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      openaiReply('```json\n{"echo":"brick"}\n```'),
    );
    const { d, rows } = deps(fetchImpl);
    const res = await call({ ...request, role: 'auditor' }, d);
    expect(res.vendor).toBe('openai');
    expect(res.output.echo).toBe('brick');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(rows[0]).toMatchObject({
      vendor: 'openai',
      model: 'test-openai-model',
      inputTokens: 13,
    });
  });

  it('retries twice, then records one error row and throws', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('overloaded', { status: 529 }));
    const { d, rows } = deps(fetchImpl);
    await expect(call({ ...request, role: 'builder' }, d)).rejects.toThrow(/529/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'error', attempts: 3, output: null });
  });

  it('recovers on a retry after a reply that does not match the output type', async () => {
    const replies = [anthropicReply('not json'), anthropicReply('{"echo":"brick"}')];
    const fetchImpl = vi.fn<typeof fetch>(async () => replies.shift()!);
    const { d, rows } = deps(fetchImpl);
    const res = await call({ ...request, role: 'builder' }, d);
    expect(res.attempts).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ok', attempts: 2, inputTokens: 22, outputTokens: 14 });
  });

  it('does not retry a request the vendor rejects', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{"error":"bad key"}', { status: 401 }),
    );
    const { d, rows } = deps(fetchImpl);
    await expect(call({ ...request, role: 'builder' }, d)).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: 'error', attempts: 1 });
  });

  it('fails at once, without retrying, when the reply stops at the token limit', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => openaiReply('', 'length'));
    const { d, rows } = deps(fetchImpl);
    await expect(call({ ...request, role: 'auditor', maxTokens: 50 }, d)).rejects.toThrow(
      OutputTruncatedError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: 'error', attempts: 1, outputTokens: 5 });
    expect(rows[0]?.error).toMatch(/token limit \(maxTokens 50\)/);
  });

  it('refuses without a model name rather than guessing one', async () => {
    const fetchImpl = vi.fn();
    const { d, rows } = deps(fetchImpl as unknown as CallDeps['fetch'], {
      ...baseEnv,
      OPENAI_MODEL: undefined,
    });
    await expect(call({ ...request, role: 'auditor' }, d)).rejects.toThrow(
      /OPENAI_MODEL is not set/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('validates raw text when format is text', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => anthropicReply('a plain sentence'));
    const { d } = deps(fetchImpl);
    const res = await call(
      { ...request, role: 'builder', format: 'text', output: z.string().min(1) },
      d,
    );
    expect(res.output).toBe('a plain sentence');
  });

  it('refuses a prompt name that could escape prompts/', async () => {
    const { d } = deps(vi.fn() as unknown as CallDeps['fetch']);
    await expect(call({ ...request, name: '../secrets', role: 'builder' }, d)).rejects.toThrow(
      /invalid prompt name/,
    );
  });
});
