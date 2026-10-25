// The four seats and their rules (Stage 9), the OpenAI-compatible adapter against a stub server and
// against Ollama when one runs on this computer, and the runner's refusal of a builder auditing itself.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compatibleComplete } from './adapters.ts';
import { call, type ModelCallRow } from './call.ts';
import { auditorChoices, envSeats, seatProblems, VENDOR_REGISTRY, type Seats } from './seats.ts';
import { VendorGuardError } from './vendors.ts';

const good: Seats = {
  builder: { vendor: 'anthropic', model: 'claude-sonnet-5-5', builder: 'claude-code' },
  auditor: { vendor: 'openai', model: 'gpt-6.1-sol' },
  drafter: { vendor: 'anthropic', model: 'claude-sonnet-5-5' },
  voice: { vendor: 'openai', model: 'gpt-realtime' },
};

describe('the seats', () => {
  it('stand when every seat is held by a vendor that may hold it and the checker is not the builder', () => {
    expect(seatProblems(good)).toEqual([]);
    expect(seatProblems({ ...good, auditor: { vendor: 'ollama', model: 'llama4' } })).toEqual([]);
  });

  it('refuse the builder’s own vendor as the auditor (Invariant 5)', () => {
    expect(
      seatProblems({ ...good, auditor: { vendor: 'anthropic', model: 'claude-opus-5-5' } }),
    ).toEqual([
      'The auditor cannot be Anthropic, the builder’s own vendor: the checker is never the builder (Invariant 5).',
    ]);
    expect(auditorChoices('anthropic').map((v) => v.id)).toEqual([
      'openai',
      'gemini',
      'grok',
      'kimi',
      'ollama',
    ]);
    expect(auditorChoices('openai').map((v) => v.id)).not.toContain('openai');
  });

  it('refuse a seat a vendor cannot hold, an unknown vendor, a missing model, and a builder on the wrong vendor', () => {
    expect(
      seatProblems({
        ...good,
        voice: { vendor: 'ollama', model: 'x' },
        drafter: { vendor: 'acme', model: '' },
        builder: { vendor: 'anthropic', model: 'm', builder: 'codex' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'Ollama (on this computer) cannot hold the voice seat.',
        '“acme” is not a vendor House of Rama knows.',
        'The drafter seat needs its model named.',
        'The builder codex does not run on Anthropic.',
      ]),
    );
    expect(seatProblems({})).toHaveLength(4);
  });

  it('come from the setup file while nobody has chosen: the drafter where the builder is, the voice OpenAI’s', () => {
    expect(
      envSeats({
        BUILDER_VENDOR: 'anthropic',
        AUDITOR_VENDOR: 'openai',
        OPENAI_MODEL: 'gpt-6.1-sol',
      }),
    ).toEqual(good);
  });

  it('list every vendor the stage names, with Ollama local and keyless', () => {
    expect(VENDOR_REGISTRY.map((v) => v.id)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'grok',
      'kimi',
      'ollama',
    ]);
    const ollama = VENDOR_REGISTRY.find((v) => v.id === 'ollama')!;
    expect(ollama).toMatchObject({ local: true, key: null, protocol: 'openai-compatible' });
    for (const id of ['gemini', 'grok', 'kimi'])
      expect(VENDOR_REGISTRY.find((v) => v.id === id)!.protocol).toBe('openai-compatible');
  });
});

describe('the OpenAI-compatible adapter', () => {
  let server: Server;
  let base: string;
  const seen: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (d) => (raw += d));
      req.on('end', () => {
        seen.push({
          path: req.url ?? '',
          auth: req.headers.authorization,
          body: JSON.parse(raw || '{}'),
        });
        if (req.headers.authorization === 'Bearer bad') {
          res.writeHead(401).end('{"error":"no"}');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            model: 'stub-model-1',
            choices: [{ message: { content: '{"echo":"brick"}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 9, completion_tokens: 4 },
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('posts chat completions to the base URL with the key, and reads the reply and its tokens', async () => {
    const out = await compatibleComplete('gemini', `${base}/`)(
      { model: 'stub-model', system: 'Be brief.', user: '{"word":"brick"}', maxTokens: 64 },
      'k-123',
      fetch,
    );
    expect(out).toEqual({
      text: '{"echo":"brick"}',
      model: 'stub-model-1',
      inputTokens: 9,
      outputTokens: 4,
      truncated: false,
    });
    expect(seen.at(-1)).toEqual({
      path: '/v1/chat/completions',
      auth: 'Bearer k-123',
      body: {
        model: 'stub-model',
        max_tokens: 64,
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: '{"word":"brick"}' },
        ],
      },
    });
  });

  it('sends no key to a vendor that needs none, and names the vendor when one refuses', async () => {
    await compatibleComplete('ollama', base)(
      { model: 'm', system: 's', user: 'u', maxTokens: 8 },
      '',
      fetch,
    );
    expect(seen.at(-1)!.auth).toBeUndefined();
    await expect(
      compatibleComplete('grok', base)(
        { model: 'm', system: 's', user: 'u', maxTokens: 8 },
        'bad',
        fetch,
      ),
    ).rejects.toThrow(/^grok responded 401/);
  });

  it('answers a call for a seat a compatible vendor holds, and records that vendor and seat', async () => {
    const rows: ModelCallRow[] = [];
    const r = await call(
      {
        name: 'echo',
        version: 1,
        input: { word: 'brick' },
        output: z.object({ echo: z.string() }),
        role: 'auditor',
        siteId: 'chai',
        createdBy: 'rama:test@0',
      },
      {
        env: {},
        seats: async () => ({
          ...good,
          auditor: { vendor: 'ollama', model: 'llama4', baseUrl: base },
        }),
        secret: async () => undefined,
        fetch,
        promptsDir: fileURLToPath(new URL('../test/fixtures/prompts', import.meta.url)),
        sleep: async () => {},
        record: async (row) => {
          rows.push(row);
          return 'row-1';
        },
      },
    );
    expect(r).toMatchObject({ output: { echo: 'brick' }, vendor: 'ollama' });
    expect(rows[0]).toMatchObject({
      role: 'auditor',
      vendor: 'ollama',
      model: 'stub-model-1',
      status: 'ok',
    });
  });

  // Against the real thing when one runs here; when none does, the adapter says it cannot reach it.
  it('talks to Ollama on this computer when it is there, and says so plainly when it is not', async () => {
    const tags = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ models?: { name: string }[] }>) : null))
      .catch(() => null);
    const model = tags?.models?.[0]?.name;
    const ask = compatibleComplete('ollama', 'http://localhost:11434/v1')(
      { model: model ?? 'none', system: 'Reply with the word yes.', user: 'yes?', maxTokens: 16 },
      '',
      fetch,
    );
    if (model) {
      const out = await ask;
      expect(out.text.length).toBeGreaterThan(0);
      expect(out.model).toContain(model.split(':')[0]);
    } else await expect(ask).rejects.toThrow(TypeError);
  });
});

describe('the runner (Invariant 5)', () => {
  it('refuses, before any prompt is read or vendor called, seats where the builder audits itself', async () => {
    let fetched = false;
    let recorded = false;
    await expect(
      call(
        {
          name: 'echo',
          version: 1,
          input: {},
          output: z.object({}),
          role: 'auditor',
          siteId: 'chai',
          createdBy: 'rama:test@0',
        },
        {
          env: {},
          seats: async () => ({
            ...good,
            auditor: { vendor: 'anthropic', model: 'claude-opus-5-5' },
          }),
          secret: async () => 'k',
          fetch: (async () => {
            fetched = true;
            return new Response('{}');
          }) as typeof fetch,
          promptsDir: '/nonexistent',
          sleep: async () => {},
          record: async () => {
            recorded = true;
            return 'x';
          },
        },
      ),
    ).rejects.toThrow(VendorGuardError);
    expect({ fetched, recorded }).toEqual({ fetched: false, recorded: false });
  });
});
