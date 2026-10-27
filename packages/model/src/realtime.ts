// The voice seat's session (Stage 10): OpenAI's Realtime API over WebRTC. The browser makes the offer;
// House of Rama's server sends it to the vendor with the key from Settings and the session it chooses,
// so the browser never holds a key, and the voice's instructions are prompt voice.v1, never the page's.
// One model_calls row for opening the session, and one for each line the voice reads (each is a
// response the vendor bills on its own), with the tokens it reported.
import { createDb, modelCalls, secretFor, type SecretName } from '@rama/db';
import { ModelConfigError, type ModelCallRow } from './call.ts';
import { VendorHttpError, type Fetch } from './adapters.ts';
import { loadPrompt, PROMPTS_DIR } from './prompts.ts';
import { vendorEntry } from './seats.ts';
import { VendorGuardError } from './vendors.ts';

export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
/** Transcription of what a person says, after their push-to-talk turn is committed; English only. */
export const TRANSCRIBE_MODEL = 'gpt-transcribe';
export const VOICE_NAME = 'marin';
export const VOICE_PROMPT = { name: 'voice', version: 1 } as const;

/**
 * The session the voice runs in. It never answers on its own: turn detection is off (each person
 * holds a button to talk, and their turn is committed when they let go), so the voice speaks only when
 * House of Rama sends it a line to read (`sayEvent` in packages/ears).
 */
export function voiceSession(model: string, instructions: string) {
  return {
    type: 'realtime',
    model,
    instructions,
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription: { model: TRANSCRIBE_MODEL, languages: ['en'] },
        turn_detection: null,
      },
      output: { voice: VOICE_NAME },
    },
  };
}

export interface OpenVoiceRequest {
  siteId: string;
  /** Person id that started the session. */
  createdBy: string;
  /** The voice seat: its vendor and model (Settings → Brains, the product's own, or the default). */
  seat: { vendor: string; model: string };
  /** The browser's SDP offer. */
  sdp: string;
}

export interface OpenVoiceDeps {
  secret: (name: SecretName) => Promise<string | undefined>;
  fetch: Fetch;
  promptsDir: string;
  record: (row: ModelCallRow) => Promise<string>;
}

async function recordRow(row: ModelCallRow): Promise<string> {
  const { db, close } = createDb();
  try {
    const [r] = await db.insert(modelCalls).values(row).returning({ id: modelCalls.id });
    return r!.id;
  } finally {
    await close();
  }
}

const defaults = (): OpenVoiceDeps => ({
  secret: (name) => secretFor(name),
  fetch: globalThis.fetch,
  promptsDir: PROMPTS_DIR,
  record: recordRow,
});

/** Starts a voice session: returns the vendor's SDP answer and the model_calls row's id. */
export async function openVoice(
  req: OpenVoiceRequest,
  overrides: Partial<OpenVoiceDeps> = {},
): Promise<{ sdp: string; callId: string; vendorCall: string | null }> {
  const deps = { ...defaults(), ...overrides };
  const v = vendorEntry(req.seat.vendor);
  if (!v || !v.seats.includes('voice'))
    throw new VendorGuardError(
      `${v?.label ?? req.seat.vendor} cannot hold the voice seat: only OpenAI's Realtime voice is wired`,
    );
  if (!req.seat.model) throw new ModelConfigError('the voice seat names no model');
  const prompt = await loadPrompt(VOICE_PROMPT.name, VOICE_PROMPT.version, deps.promptsDir);
  const key = v.key ? await deps.secret(v.key) : '';
  if (v.key && !key)
    throw new ModelConfigError(`${v.key} is not set: enter the ${v.label} key in Settings`);
  const session = voiceSession(req.seat.model, prompt.text);
  const started = Date.now();
  const form = new FormData();
  form.set('sdp', req.sdp);
  form.set('session', JSON.stringify(session));
  let answer = '';
  let vendorCall: string | null = null;
  let failure: Error | null = null;
  try {
    const res = await deps.fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    answer = await res.text();
    if (!res.ok) throw new VendorHttpError('OpenAI Realtime', res.status, answer);
    vendorCall = res.headers.get('location')?.split('/').pop() ?? null;
  } catch (err) {
    failure = err as Error;
  }
  const error = failure ? failure.message : null;
  // The row names the instructions by the prompt's hash; their text is in prompts/.
  const shown = { ...session, instructions: undefined };
  const callId = await deps.record({
    siteId: req.siteId,
    prompt: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    role: 'voice',
    vendor: v.id,
    model: req.seat.model,
    input: { session: shown },
    output: error ? null : { vendorCall },
    status: error ? 'error' : 'ok',
    error,
    attempts: 1,
    inputTokens: null,
    outputTokens: null,
    ms: Date.now() - started,
    createdBy: req.createdBy,
  });
  if (failure) throw failure;
  return { sdp: answer, callId, vendorCall };
}

/**
 * One line the voice read (Stage 10): its own response from the vendor, billed on its own, so its own
 * model_calls row with the line it was handed, what it actually said, and the tokens the vendor
 * reported for it. Rows are never changed afterwards (model_calls is append-only).
 */
export async function recordVoiceLine(
  req: {
    siteId: string;
    createdBy: string;
    model: string;
    line: string;
    said: string;
    inputTokens: number | null;
    outputTokens: number | null;
    ms: number;
  },
  overrides: Partial<Pick<OpenVoiceDeps, 'promptsDir' | 'record'>> = {},
): Promise<string> {
  const deps = { ...defaults(), ...overrides };
  const prompt = await loadPrompt(VOICE_PROMPT.name, VOICE_PROMPT.version, deps.promptsDir);
  return deps.record({
    siteId: req.siteId,
    prompt: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    role: 'voice',
    vendor: 'openai',
    model: req.model,
    input: { line: req.line },
    output: { said: req.said },
    status: 'ok',
    error: null,
    attempts: 1,
    inputTokens: req.inputTokens,
    outputTokens: req.outputTokens,
    ms: req.ms,
    createdBy: req.createdBy,
  });
}
