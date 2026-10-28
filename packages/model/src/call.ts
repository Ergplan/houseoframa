// call(): the only way House of Rama talks to a model vendor (rule 8).
// Order: vendor guard → prompt → model and key → up to 3 attempts → one model_calls row → typed output.
import type { z } from 'zod';
import { createDb, getSetting, modelCalls, secretFor, type SecretName } from '@rama/db';
import pkg from '../package.json' with { type: 'json' };
import {
  ADAPTERS,
  compatibleComplete,
  VendorHttpError,
  type Completion,
  type CompletionRequest,
  type Fetch,
  type Document,
  type Image,
  type Source,
} from './adapters.ts';
import { loadPrompt, PROMPTS_DIR } from './prompts.ts';
import {
  BRAINS_SETTING,
  brainsSettingOf,
  seatProblems,
  vendorEntry,
  type Seat,
  type Seats,
} from './seats.ts';
import { resolveVendors, VendorGuardError } from './vendors.ts';

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
  /**
   * The seat that answers: its vendor and model come from the product's seats (Settings → Brains), or,
   * while nobody has chosen, BUILDER_VENDOR (builder and drafter) or AUDITOR_VENDOR (auditor).
   */
  role: Seat;
  /** The site the call is made for (model_calls.site_id). */
  siteId: string;
  /** Person id or `rama:<component>@<version>` that asked for the call. */
  createdBy: string;
  maxTokens?: number;
  /** Pictures sent with the input (Stage 10: a frame of the board). Not stored in the row. */
  images?: Image[];
  /** Files sent with the input (Stage 12: the idea room's). Not stored in the row; their names are. */
  documents?: Document[];
  /** Lets the model search the web (Stage 12); the pages it read come back as `sources`. */
  webSearch?: boolean;
  /**
   * Vendors that may not answer this call, whatever the seats say: the companies whose builders built
   * the product an audit checks (Invariant 5). Refused before any prompt is read or vendor called.
   */
  notVendors?: string[];
}

export interface CallResult<O> {
  output: O;
  callId: string;
  vendor: string;
  model: string;
  attempts: number;
  /** Summed over every attempt that got a reply. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** The pages a web search read, as the vendor returned them; present only when asked for. */
  sources?: Source[];
}

export type ModelCallRow = typeof modelCalls.$inferInsert;

export interface CallDeps {
  env: Record<string, string | undefined>;
  /** A vendor key: from Settings, or from the environment while Settings holds none (rule 11). */
  secret: (name: SecretName) => Promise<string | undefined>;
  fetch: Fetch;
  promptsDir: string;
  /** Writes one model_calls row and returns its id. */
  record: (row: ModelCallRow) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  /** The seats chosen for the site, or by default; null while nobody has chosen any. */
  seats: (siteId: string) => Promise<Partial<Seats> | null>;
}

/**
 * The seats in Settings → Brains for the site, else the default ones, read from the database the
 * environment names; null when there is none, or nobody has chosen.
 */
export async function storedSeats(
  siteId: string,
  env: Record<string, string | undefined>,
): Promise<Partial<Seats> | null> {
  if (!env.DATABASE_URL) return null;
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    return (
      (await getSetting<Partial<Seats>>(db, brainsSettingOf(siteId))) ??
      (await getSetting<Partial<Seats>>(db, BRAINS_SETTING)) ??
      null
    );
  } finally {
    await close();
  }
}

async function recordToDb(
  row: ModelCallRow,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const { db, close } = createDb(env.DATABASE_URL);
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
  secret: (name) => secretFor(name),
  fetch: globalThis.fetch,
  promptsDir: PROMPTS_DIR,
  record: (row) => recordToDb(row),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  seats: (siteId) => storedSeats(siteId, process.env),
});

/** The vendor, model, key name and adapter that answer for a seat; refuses seats that cannot stand. */
export async function resolveSeat(
  seat: Seat,
  siteId: string,
  deps: Pick<CallDeps, 'env' | 'seats'>,
): Promise<{
  vendor: string;
  model: string | undefined;
  modelVar: string | null;
  keyName: SecretName | null;
  complete: (req: CompletionRequest, key: string, f: Fetch) => Promise<Completion>;
}> {
  const chosen = await deps.seats(siteId);
  if (!chosen) {
    if (seat === 'voice')
      throw new VendorGuardError('the voice seat is not chosen in Settings → Brains');
    const vendor = resolveVendors(deps.env)[seat === 'drafter' ? 'builder' : seat];
    const a = ADAPTERS[vendor];
    return {
      vendor,
      model: deps.env[a.modelVar] || a.defaultModel,
      modelVar: a.modelVar,
      keyName: a.keyVar,
      complete: a.complete,
    };
  }
  const problems = seatProblems(chosen);
  if (problems.length) throw new VendorGuardError(problems.join(' '));
  const c = chosen[seat]!;
  const v = vendorEntry(c.vendor)!;
  return {
    vendor: v.id,
    model: c.model,
    modelVar: null,
    keyName: v.key,
    complete:
      v.protocol === 'openai-compatible'
        ? compatibleComplete(v.id, c.baseUrl ?? v.baseUrl)
        : ADAPTERS[v.protocol].complete,
  };
}

function parseOutput<O>(text: string, schema: z.ZodType<O>, format: 'json' | 'text'): O {
  let value: unknown = text;
  if (format === 'json') {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    try {
      value = JSON.parse((fenced?.[1] ?? text).trim());
    } catch {
      throw new OutputParseError(`reply is not JSON: ${text}`); // whole: the row is where a bad reply is diagnosed
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
  // Seats are read from the database the given environment names, so a call made with its own
  // environment (a test) never picks up seats chosen in this laptop's Settings.
  if (!overrides.seats) deps.seats = (siteId) => storedSeats(siteId, deps.env);
  // So are its keys and its row: a test's call never spends this laptop's keys or writes into its
  // database.
  if (overrides.env && !overrides.secret) deps.secret = (name) => secretFor(name, deps.env);
  if (overrides.env && !overrides.record) deps.record = (row) => recordToDb(row, deps.env);

  // Refuse before anything else: no prompt read, no vendor call, no row.
  const seat = await resolveSeat(req.role, req.siteId, deps);
  const vendor = seat.vendor;
  if (req.notVendors?.includes(vendor))
    throw new VendorGuardError(
      `${vendorEntry(vendor)?.label ?? vendor} may not answer this call: its builder built what is being checked, and the checker is never the builder (Invariant 5)`,
    );
  const prompt = await loadPrompt(req.name, req.version, deps.promptsDir);
  const model = seat.model;
  if (!model)
    throw new ModelConfigError(
      seat.modelVar ? `${seat.modelVar} is not set` : `the ${req.role} seat names no model`,
    );
  const apiKey = seat.keyName ? await deps.secret(seat.keyName) : '';
  if (seat.keyName && !apiKey)
    throw new ModelConfigError(
      `${seat.keyName} is not set: enter the ${vendorEntry(vendor)?.label ?? vendor} key in Settings`,
    );

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
      completion = await seat.complete(
        {
          model,
          system: prompt.text,
          user,
          maxTokens,
          ...(req.images ? { images: req.images } : {}),
          ...(req.documents?.length ? { documents: req.documents } : {}),
          ...(req.webSearch ? { webSearch: true } : {}),
        },
        apiKey ?? '',
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
    input: (req.documents?.length || req.webSearch
      ? {
          ...(req.input as object),
          ...(req.documents?.length ? { files: req.documents.map((d) => d.name) } : {}),
          ...(req.webSearch ? { webSearch: true } : {}),
        }
      : req.input) as object,
    output: ok
      ? ((completion?.sources ? { output, sources: completion.sources } : output) as object)
      : completion
        ? { unparsed: completion.text }
        : null,
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
    ...(completion?.sources ? { sources: completion.sources } : {}),
  };
}
