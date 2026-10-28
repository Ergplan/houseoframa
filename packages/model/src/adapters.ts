// Vendor adapters over plain fetch. Each turns (system, user) into text plus token usage.
import type { SecretName } from '@rama/db';

export interface Completion {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** True when the vendor stopped at the token limit, so the reply is incomplete. */
  truncated: boolean;
  /** The pages a web search read for the reply, as the vendor returned them (never as the model named them). */
  sources?: Source[];
}

export interface Source {
  url: string;
  title: string;
}

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** Pictures sent with the user turn (Stage 10: a frame of the board), base64. */
  images?: Image[];
  /** Files sent with the user turn (Stage 12: what a person put in the idea room). */
  documents?: Document[];
  /** Lets the model search the web for the reply (Stage 12, the idea room). */
  webSearch?: boolean;
}

/** A PDF as it is, or a text file's words; named as the person named it. */
export type Document =
  { kind: 'pdf'; name: string; base64: string } | { kind: 'text'; name: string; text: string };

/** Thrown before any request when a vendor's adapter cannot send what was asked (a PDF, a web search). */
export class AdapterSupportError extends Error {
  override name = 'AdapterSupportError';
}

/** The text files of a request, as text after the person's words (for adapters with no document part). */
const textDocuments = (req: CompletionRequest) =>
  (req.documents ?? [])
    .filter((d): d is Extract<Document, { kind: 'text' }> => d.kind === 'text')
    .map((d) => `\n\n--- ${d.name} ---\n${d.text}`)
    .join('');

export interface Image {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

/**
 * The user turn in OpenAI's chat form: plain text, or text with pictures and PDFs (as file parts, which
 * only OpenAI's own endpoint takes). Text files follow the person's words.
 */
const openaiUser = (req: CompletionRequest, pdfs = true) => {
  const text = req.user + textDocuments(req);
  const files = (req.documents ?? []).filter((d) => d.kind === 'pdf');
  if (files.length && !pdfs)
    throw new AdapterSupportError('this vendor is not sent PDFs here: save the file as text');
  if (!req.images?.length && !files.length) return text;
  return [
    { type: 'text', text },
    ...(req.images ?? []).map((i) => ({
      type: 'image_url',
      image_url: { url: `data:${i.mediaType};base64,${i.base64}` },
    })),
    ...files.map((d) => ({
      type: 'file',
      file: { filename: d.name, file_data: `data:application/pdf;base64,${d.base64}` },
    })),
  ];
};

export type Fetch = typeof fetch;

/** An HTTP failure from a vendor. `retryable` is true for rate limits and server errors. */
export class VendorHttpError extends Error {
  override name = 'VendorHttpError';
  constructor(
    readonly vendor: string,
    readonly status: number,
    body: string,
  ) {
    super(`${vendor} responded ${status}: ${body.slice(0, 300)}`);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

async function postJson(
  vendor: string,
  f: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new VendorHttpError(vendor, res.status, text);
  return JSON.parse(text) as unknown;
}

/** Anthropic's content blocks for the user turn: the files, the pictures, then the words. */
const anthropicUser = (req: CompletionRequest) =>
  req.images?.length || req.documents?.length
    ? [
        ...(req.documents ?? []).map((d) =>
          d.kind === 'pdf'
            ? {
                type: 'document',
                title: d.name,
                source: { type: 'base64', media_type: 'application/pdf', data: d.base64 },
              }
            : {
                type: 'document',
                title: d.name,
                source: { type: 'text', media_type: 'text/plain', data: d.text },
              },
        ),
        ...(req.images ?? []).map((i) => ({
          type: 'image',
          source: { type: 'base64', media_type: i.mediaType, data: i.base64 },
        })),
        { type: 'text', text: req.user },
      ]
    : req.user;

interface AnthropicBlock {
  type: string;
  text?: string;
  content?: unknown;
  citations?: { url?: string; title?: string }[] | null;
}

/** Every page a web search returned, and every page a sentence cites, once each, in order. */
export function anthropicSources(blocks: AnthropicBlock[]): Source[] {
  const seen = new Map<string, Source>();
  const add = (url: unknown, title: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url) || seen.has(url)) return;
    seen.set(url, { url, title: typeof title === 'string' && title.trim() ? title.trim() : url });
  };
  for (const b of blocks) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content))
      for (const r of b.content as { url?: unknown; title?: unknown }[]) add(r.url, r.title);
    for (const c of b.citations ?? []) add(c.url, c.title);
  }
  return [...seen.values()];
}

/** A turn with a server tool may pause; it is sent back as it stands, this many times at most. */
const MAX_CONTINUATIONS = 4;

export async function anthropicComplete(
  req: CompletionRequest,
  apiKey: string,
  f: Fetch,
): Promise<Completion> {
  const messages: { role: string; content: unknown }[] = [
    { role: 'user', content: anthropicUser(req) },
  ];
  const blocks: AnthropicBlock[] = [];
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  for (let turn = 0; ; turn++) {
    const json = (await postJson(
      'anthropic',
      f,
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages,
        ...(req.webSearch ? { tools: [{ type: 'web_search_20260209', name: 'web_search' }] } : {}),
      },
    )) as {
      model: string;
      content: AnthropicBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    blocks.push(...json.content);
    if (json.usage?.input_tokens != null)
      inputTokens = (inputTokens ?? 0) + json.usage.input_tokens;
    if (json.usage?.output_tokens != null)
      outputTokens = (outputTokens ?? 0) + json.usage.output_tokens;
    if (json.stop_reason === 'pause_turn' && turn < MAX_CONTINUATIONS) {
      messages.push({ role: 'assistant', content: json.content });
      continue;
    }
    const sources = anthropicSources(blocks);
    return {
      text: blocks
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join(''),
      model: json.model,
      inputTokens,
      outputTokens,
      truncated: json.stop_reason === 'max_tokens' || json.stop_reason === 'pause_turn',
      ...(req.webSearch ? { sources } : {}),
    };
  }
}

export async function openaiComplete(
  req: CompletionRequest,
  apiKey: string,
  f: Fetch,
): Promise<Completion> {
  if (req.webSearch)
    throw new AdapterSupportError(
      'web search is wired for the Anthropic drafter only: choose Anthropic for the drafter in the brains',
    );
  const json = (await postJson(
    'openai',
    f,
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${apiKey}` },
    {
      model: req.model,
      max_completion_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: openaiUser(req) },
      ],
    },
  )) as {
    model: string;
    choices: { message: { content: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices[0]?.message.content ?? '',
    model: json.model,
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
    // Reasoning models spend hidden tokens from the same budget; an empty reply often means this.
    truncated: json.choices[0]?.finish_reason === 'length',
  };
}

/**
 * The one adapter for every provider that speaks OpenAI's chat completions (Gemini, Grok, Kimi, Ollama
 * and others): a base URL, a key (none for a model on this computer) and a model.
 */
export const compatibleComplete =
  (vendor: string, baseUrl: string) =>
  async (req: CompletionRequest, apiKey: string, f: Fetch): Promise<Completion> => {
    if (req.webSearch)
      throw new AdapterSupportError(
        'web search is wired for the Anthropic drafter only: choose Anthropic for the drafter in the brains',
      );
    const json = (await postJson(
      vendor,
      f,
      `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      {
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: openaiUser(req, false) },
        ],
      },
    )) as {
      model?: string;
      choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? req.model,
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
      truncated: json.choices?.[0]?.finish_reason === 'length',
    };
  };

export const ADAPTERS: Record<
  'anthropic' | 'openai',
  {
    complete: typeof anthropicComplete;
    keyVar: SecretName;
    modelVar: string;
    defaultModel?: string;
  }
> = {
  anthropic: {
    complete: anthropicComplete,
    keyVar: 'ANTHROPIC_API_KEY',
    modelVar: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-5-5',
  },
  // No default: the OpenAI model must be named in OPENAI_MODEL rather than guessed.
  openai: { complete: openaiComplete, keyVar: 'OPENAI_API_KEY', modelVar: 'OPENAI_MODEL' },
};
