// Vendor adapters over plain fetch. Each turns (system, user) into text plus token usage.
import type { SecretName } from '@rama/db';

export interface Completion {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** True when the vendor stopped at the token limit, so the reply is incomplete. */
  truncated: boolean;
}

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

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

export async function anthropicComplete(
  req: CompletionRequest,
  apiKey: string,
  f: Fetch,
): Promise<Completion> {
  const json = (await postJson(
    'anthropic',
    f,
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    },
  )) as {
    model: string;
    content: { type: string; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: json.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join(''),
    model: json.model,
    inputTokens: json.usage?.input_tokens ?? null,
    outputTokens: json.usage?.output_tokens ?? null,
    truncated: json.stop_reason === 'max_tokens',
  };
}

export async function openaiComplete(
  req: CompletionRequest,
  apiKey: string,
  f: Fetch,
): Promise<Completion> {
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
        { role: 'user', content: req.user },
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
          { role: 'user', content: req.user },
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
