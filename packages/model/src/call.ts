// call(): the only way House of Rama talks to a model vendor (rule 8).
// Order: vendor guard → prompt → model and key → up to 3 attempts → one model_calls row → typed output.
import type { z } from 'zod';
import { createDb, modelCalls } from '@rama/db';
import pkg from '../package.json' with { type: 'json' };
import { ADAPTERS, VendorHttpError, type Completion, type Fetch } from './adapters.ts';
import { loadPrompt, PROMPTS_DIR } from './prompts.ts';
import { resolveVendors, type Role, type Vendor } from './vendors.ts';

export const MODEL_COMPONENT = `rama:model@${pkg.version}`;
export const MAX_ATTEMPTS = 3; // the first try and two retries

export class ModelConfigError extends Error {
  override name = 'ModelConfigError';
}

export class OutputParseError extends Error {
  override name = 'OutputParseError';
}

/** The vendor stopped at the token limit. Not retried: the same budget would stop it again. */
export class OutputTruncatedError extends Error {
  override name = 'OutputTruncatedError';
}

export interface CallRequest<I, O> {
  /** Prompt name: loads prompts/<name>.v<version>.md. */
  name: string;
  version: number;
  /** Sent to the model as JSON in the user turn. */
  input: I;
  /** Typed output. With format "json" (default) the reply is parsed as JSON first; with "text" the raw reply is validated. */
  output: z.ZodType<O>;
  format?: 'json' | 'text';
  /** Which configured vendor answers: BUILDER_VENDOR or AUDITOR_VENDOR. */
  role: Role;
  /** The site the call is made for (model_calls.site_id). */
  siteId: string;
  /** Person id or `rama:<component>@<version>` that asked for the call. */
  createdBy: string;
  maxTokens?: number;
}

export interface CallResult<O> {
  output: O;
  callId: string;
  vendor: Vendor;
  model: string;
  attempts: number;
  /** Summed over every attempt that got a reply. */
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ModelCallRow = typeof modelCalls.$inferInsert;

export interface CallDeps {
  env: Record<string, string | undefined>;
  fetch: Fetch;
  promptsDir: string;
  /** Writes one model_calls row and returns its id. */
  record: (row: ModelCallRow) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
}

async function recordToDb(row: ModelCallRow): Promise<string> {
  const { db, close } = createDb();
  try {
    const [inserted] = await db.insert(modelCalls).values(row).returning({ id: modelCalls.id });
    if (!inserted) throw new Error('model_calls insert returned no row');
    return inserted.id;
  } finally {
    await close();
  }
}

const defaultDeps = (): CallDeps => ({
  env: process.env,
  fetch: globalThis.fetch,
  promptsDir: PROMPTS_DIR,
  record: recordToDb,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

function parseOutput<O>(text: string, schema: z.ZodType<O>, format: 'json' | 'text'): O {
  let value: unknown = text;
  if (format === 'json') {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    try {
      value = JSON.parse((fenced?.[1] ?? text).trim());
    } catch {
      throw new OutputParseError(`reply is not JSON: ${text.slice(0, 200)}`);
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new OutputParseError(`reply does not match the output type: ${parsed.error.message}`);
  return parsed.data;
}

function retryable(err: unknown): boolean {
  if (err instanceof VendorHttpError) return err.retryable;
  if (err instanceof OutputParseError) return true;
  return err instanceof TypeError; // fetch network failure
}

export async function call<I, O>(
  req: CallRequest<I, O>,
  overrides: Partial<CallDeps> = {},
): Promise<CallResult<O>> {
  const deps = { ...defaultDeps(), ...overrides };

  // Refuse before anything else: no prompt read, no vendor call, no row.
  const vendor = resolveVendors(deps.env)[req.role];
  const prompt = await loadPrompt(req.name, req.version, deps.promptsDir);
  const adapter = ADAPTERS[vendor];
  const model = deps.env[adapter.modelVar] || adapter.defaultModel;
  if (!model) throw new ModelConfigError(`${adapter.modelVar} is not set`);
  const apiKey = deps.env[adapter.keyVar];
  if (!apiKey) throw new ModelConfigError(`${adapter.keyVar} is not set`);

  const format = req.format ?? 'json';
  const user = JSON.stringify(req.input);
  const maxTokens = req.maxTokens ?? 4096;
  const started = Date.now();
  let attempts = 0;
  let completion: Completion | null = null;
  let output: O | undefined;
  let lastError: unknown;
  // Summed over every attempt that got a reply: each one was billed.
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    try {
      completion = await adapter.complete(
        { model, system: prompt.text, user, maxTokens },
        apiKey,
        deps.fetch,
      );
      if (completion.inputTokens !== null)
        inputTokens = (inputTokens ?? 0) + completion.inputTokens;
      if (completion.outputTokens !== null)
        outputTokens = (outputTokens ?? 0) + completion.outputTokens;
      if (completion.truncated) {
        throw new OutputTruncatedError(
          `${vendor} stopped at the token limit (maxTokens ${maxTokens}) before finishing the reply`,
        );
      }
      output = parseOutput(completion.text, req.output, format);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (!retryable(err) || attempts >= MAX_ATTEMPTS) break;
      await deps.sleep(500 * 2 ** (attempts - 1));
    }
  }

  const ok = lastError === undefined;
  const callId = await deps.record({
    siteId: req.siteId,
    prompt: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    role: req.role,
    vendor,
    model: completion?.model ?? model,
    input: req.input as object,
    output: ok ? (output as object) : completion ? { unparsed: completion.text } : null,
    status: ok ? 'ok' : 'error',
    error: ok ? null : String((lastError as Error)?.message ?? lastError),
    attempts,
    inputTokens,
    outputTokens,
    ms: Date.now() - started,
    createdBy: req.createdBy,
  });

  if (!ok) throw lastError;
  return {
    output: output as O,
    callId,
    vendor,
    model: completion?.model ?? model,
    attempts,
    inputTokens,
    outputTokens,
  };
}
