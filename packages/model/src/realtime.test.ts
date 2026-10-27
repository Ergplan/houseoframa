// The voice seat's session (Stage 10), against a stand-in for OpenAI: the offer goes with the key from
// Settings and the session House of Rama chooses (voice.v1, push-to-talk, no reply of its own), the
// answer comes back, one model_calls row is written; a vendor that cannot speak is refused first.
import { describe, expect, it } from 'vitest';
import type { ModelCallRow } from './call.ts';
import { openVoice, recordVoiceLine, REALTIME_CALLS_URL, voiceSession } from './realtime.ts';
import { anthropicComplete, openaiComplete } from './adapters.ts';

const seat = { vendor: 'openai', model: 'gpt-realtime' };

describe('the voice session', () => {
  it('sends the offer with the session House of Rama chooses, and records one row', async () => {
    const sent: { url: string; auth: string; sdp: string; session: Record<string, unknown> }[] = [];
    const rows: ModelCallRow[] = [];
    const res = await openVoice(
      { siteId: 'chai', createdBy: 'p1', seat, sdp: 'v=0 offer' },
      {
        secret: async () => 'sk-test',
        record: async (row) => (rows.push(row), 'row-1'),
        fetch: (async (url: string, init: RequestInit) => {
          const form = init.body as FormData;
          sent.push({
            url,
            auth: (init.headers as Record<string, string>).authorization!,
            sdp: String(form.get('sdp')),
            session: JSON.parse(String(form.get('session'))),
          });
          return new Response('v=0 answer', {
            status: 201,
            headers: { location: '/v1/realtime/calls/rtc_123' },
          });
        }) as typeof fetch,
      },
    );
    expect(res).toEqual({ sdp: 'v=0 answer', callId: 'row-1', vendorCall: 'rtc_123' });
    expect(sent[0]).toMatchObject({
      url: REALTIME_CALLS_URL,
      auth: 'Bearer sk-test',
      sdp: 'v=0 offer',
    });
    const s = sent[0]!.session as ReturnType<typeof voiceSession>;
    expect(s.model).toBe('gpt-realtime');
    expect(s.instructions).toMatch(/^You are the voice of House of Rama/);
    expect(s.instructions).toContain('You are a mouth, not a mind.');
    // Push-to-talk: the voice never takes a turn on its own.
    expect(s.audio.input.turn_detection).toBeNull();
    expect(s.audio.input.transcription).toEqual({ model: 'gpt-transcribe', languages: ['en'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: 'voice',
      vendor: 'openai',
      model: 'gpt-realtime',
      prompt: 'voice',
      promptVersion: 1,
      status: 'ok',
      output: { vendorCall: 'rtc_123' },
    });
    // The row keeps the session, not the instructions' text (the prompt's hash names it).
    expect(JSON.stringify(rows[0]!.input)).not.toContain('mouth, not a mind');
    expect(JSON.stringify(rows[0])).not.toContain('sk-test');
  });

  it('records a refused session and says why', async () => {
    const rows: ModelCallRow[] = [];
    await expect(
      openVoice(
        { siteId: 'chai', createdBy: 'p1', seat, sdp: 'v=0' },
        {
          secret: async () => 'sk-test',
          record: async (row) => (rows.push(row), 'row-2'),
          fetch: (async () =>
            new Response('{"error":"bad model"}', { status: 400 })) as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow('OpenAI Realtime responded 400: {"error":"bad model"}');
    expect(rows[0]).toMatchObject({ status: 'error', role: 'voice' });
  });

  it('refuses a vendor with no voice, and a missing key, before calling anyone', async () => {
    const never = (async () => {
      throw new Error('called');
    }) as unknown as typeof fetch;
    await expect(
      openVoice(
        { siteId: 'chai', createdBy: 'p1', seat: { vendor: 'anthropic', model: 'x' }, sdp: 'v=0' },
        { fetch: never },
      ),
    ).rejects.toThrow('Anthropic cannot hold the voice seat');
    await expect(
      openVoice(
        { siteId: 'chai', createdBy: 'p1', seat, sdp: 'v=0' },
        { fetch: never, secret: async () => undefined },
      ),
    ).rejects.toThrow('OPENAI_API_KEY is not set: enter the OpenAI key in Settings');
  });
});

describe('a line the voice read', () => {
  it('is its own row: the line, what was said, the tokens', async () => {
    const rows: ModelCallRow[] = [];
    const id = await recordVoiceLine(
      {
        siteId: 'chai',
        createdBy: 'p1',
        model: 'gpt-realtime',
        line: 'Yes?',
        said: 'Yes?',
        inputTokens: 8,
        outputTokens: 178,
        ms: 900,
      },
      { record: async (row) => (rows.push(row), 'row-9') },
    );
    expect(id).toBe('row-9');
    expect(rows[0]).toMatchObject({
      role: 'voice',
      prompt: 'voice',
      input: { line: 'Yes?' },
      output: { said: 'Yes?' },
      inputTokens: 8,
      outputTokens: 178,
      status: 'ok',
    });
  });
});

describe('pictures in a model call', () => {
  const capture = () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          model: 'm',
          content: [{ type: 'text', text: '{}' }],
          choices: [{ message: { content: '{}' } }],
        }),
      );
    }) as typeof fetch;
    return { bodies, f };
  };
  const req = {
    model: 'm',
    system: 's',
    user: '{"product":"Chai"}',
    maxTokens: 10,
    images: [{ mediaType: 'image/png' as const, base64: 'AAA' }],
  };

  it('go to Anthropic as image blocks before the text', async () => {
    const { bodies, f } = capture();
    await anthropicComplete(req, 'k', f);
    expect((bodies[0]!.messages as { content: unknown }[])[0]!.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: '{"product":"Chai"}' },
    ]);
  });

  it('go to OpenAI as data URLs after the text', async () => {
    const { bodies, f } = capture();
    await openaiComplete(req, 'k', f);
    expect((bodies[0]!.messages as { content: unknown }[])[1]!.content).toEqual([
      { type: 'text', text: '{"product":"Chai"}' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]);
  });
});
