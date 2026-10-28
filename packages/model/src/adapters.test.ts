// The adapters' files and web search (Stage 12, the idea room): what each vendor is sent, and the pages
// a search read taken from the vendor's own result blocks, never from the model's words.
import { describe, expect, it, vi } from 'vitest';
import {
  AdapterSupportError,
  anthropicComplete,
  anthropicSources,
  compatibleComplete,
  openaiComplete,
  type CompletionRequest,
} from './adapters.ts';

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  model: 'm',
  system: 'sys',
  user: 'What does this tariff say?',
  maxTokens: 100,
  ...over,
});
const pdf = { kind: 'pdf' as const, name: 'tariff.pdf', base64: 'JVBERi0x' };
const csv = { kind: 'text' as const, name: 'load.csv', text: 'hour,kW\n1,40' };

/** A fetch that answers each request with the next reply, keeping the bodies it was sent. */
function vendor(...replies: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json(replies[bodies.length - 1]);
  });
  return { f: f as unknown as typeof fetch, bodies };
}

describe('Anthropic', () => {
  it('sends a PDF and a text file as documents, named, before the words', async () => {
    const v = vendor({ model: 'm', content: [{ type: 'text', text: 'ok' }], usage: {} });
    await anthropicComplete(req({ documents: [pdf, csv] }), 'k', v.f);
    const content = (v.bodies[0]!.messages as { content: unknown }[])[0]!.content;
    expect(content).toEqual([
      {
        type: 'document',
        title: 'tariff.pdf',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' },
      },
      {
        type: 'document',
        title: 'load.csv',
        source: { type: 'text', media_type: 'text/plain', data: 'hour,kW\n1,40' },
      },
      { type: 'text', text: 'What does this tariff say?' },
    ]);
    expect(v.bodies[0]).not.toHaveProperty('tools');
  });

  it('searches the web when asked, carries on a paused turn, and keeps the pages it read', async () => {
    const v = vendor(
      {
        model: 'm',
        stop_reason: 'pause_turn',
        content: [
          { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
          {
            type: 'web_search_tool_result',
            tool_use_id: 's1',
            content: [
              { type: 'web_search_result', url: 'https://merc.gov.in/order', title: 'MERC order' },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 2 },
      },
      {
        model: 'm',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'The open-access charge is set yearly.',
            citations: [
              { url: 'https://merc.gov.in/order', title: 'MERC order' },
              { url: 'https://cea.nic.in/', title: '' },
            ],
          },
        ],
        usage: { input_tokens: 30, output_tokens: 8 },
      },
    );
    const c = await anthropicComplete(req({ webSearch: true }), 'k', v.f);
    expect(v.bodies[0]!.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search' }]);
    // The paused turn goes back as the assistant's, unchanged.
    expect((v.bodies[1]!.messages as { role: string }[]).map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(c).toMatchObject({
      text: 'The open-access charge is set yearly.',
      inputTokens: 40,
      outputTokens: 10,
      truncated: false,
      sources: [
        { url: 'https://merc.gov.in/order', title: 'MERC order' },
        { url: 'https://cea.nic.in/', title: 'https://cea.nic.in/' },
      ],
    });
  });

  it('takes sources only from result blocks and citations, and only web addresses', () => {
    expect(
      anthropicSources([
        { type: 'text', text: 'see https://made-up.example' },
        {
          type: 'web_search_tool_result',
          content: [
            { url: 'javascript:alert(1)', title: 'x' },
            { url: 'https://a.in', title: 'A' },
          ],
        },
      ]),
    ).toEqual([{ url: 'https://a.in', title: 'A' }]);
  });
});

describe('OpenAI and compatible vendors', () => {
  it('OpenAI is sent a PDF as a file part and a text file after the words', async () => {
    const v = vendor({ model: 'm', choices: [{ message: { content: 'ok' } }] });
    await openaiComplete(req({ documents: [pdf, csv] }), 'k', v.f);
    const user = (v.bodies[0]!.messages as { content: unknown }[])[1]!.content;
    expect(user).toEqual([
      { type: 'text', text: 'What does this tariff say?\n\n--- load.csv ---\nhour,kW\n1,40' },
      {
        type: 'file',
        file: { filename: 'tariff.pdf', file_data: 'data:application/pdf;base64,JVBERi0x' },
      },
    ]);
  });

  it('web search is refused before any request, with the way round', async () => {
    const v = vendor();
    await expect(openaiComplete(req({ webSearch: true }), 'k', v.f)).rejects.toThrow(
      AdapterSupportError,
    );
    await expect(
      compatibleComplete('gemini', 'https://g.test')(req({ webSearch: true }), 'k', v.f),
    ).rejects.toThrow(/Anthropic drafter only/);
    expect(v.bodies).toHaveLength(0);
  });

  it('a compatible vendor takes text files but not PDFs', async () => {
    const v = vendor({ choices: [{ message: { content: 'ok' } }] });
    await compatibleComplete('ollama', 'http://o.test/v1')(req({ documents: [csv] }), '', v.f);
    expect((v.bodies[0]!.messages as { content: unknown }[])[1]!.content).toContain('load.csv');
    await expect(
      compatibleComplete('ollama', 'http://o.test/v1')(req({ documents: [pdf] }), '', v.f),
    ).rejects.toThrow(/not sent PDFs/);
  });
});
