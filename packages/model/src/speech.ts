// Speech from text (Stage 10), for the recorded rehearsal's audio clips only: what a person says in the
// rehearsal, spoken by OpenAI's speech model so the live voice can hear it in place of a microphone.
// Through packages/model like every vendor call: a versioned prompt (clip.v1, the speaking style), the
// key from Settings, one model_calls row.
import { createDb, modelCalls, secretFor, type SecretName } from '@rama/db';
import type { Fetch } from './adapters.ts';
import { VendorHttpError } from './adapters.ts';
import type { ModelCallRow } from './call.ts';
import { loadPrompt, PROMPTS_DIR } from './prompts.ts';

export const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const SPEECH_MODEL = 'gpt-4o-mini-tts';

export interface SpeechDeps {
  secret: (name: SecretName) => Promise<string | undefined>;
  fetch: Fetch;
  promptsDir: string;
  record: (row: ModelCallRow) => Promise<string>;
}

const defaults = (): SpeechDeps => ({
  secret: (name) => secretFor(name),
  fetch: globalThis.fetch,
  promptsDir: PROMPTS_DIR,
  record: async (row) => {
    const { db, close } = createDb();
    try {
      return (await db.insert(modelCalls).values(row).returning({ id: modelCalls.id }))[0]!.id;
    } finally {
      await close();
    }
  },
});

/** The words spoken, as a WAV file's bytes. */
export async function synthesize(
  req: { text: string; voice: string; siteId: string; createdBy: string },
  overrides: Partial<SpeechDeps> = {},
): Promise<Buffer> {
  const deps = { ...defaults(), ...overrides };
  const prompt = await loadPrompt('clip', 1, deps.promptsDir);
  const key = await deps.secret('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY is not set: enter the OpenAI key in Settings');
  const started = Date.now();
  let audio: Buffer | null = null;
  let error: string | null = null;
  try {
    const res = await deps.fetch(SPEECH_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: SPEECH_MODEL,
        voice: req.voice,
        input: req.text,
        instructions: prompt.text,
        response_format: 'wav',
      }),
    });
    if (!res.ok) throw new VendorHttpError('OpenAI speech', res.status, await res.text());
    audio = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    error = (err as Error).message;
  }
  await deps.record({
    siteId: req.siteId,
    prompt: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    role: 'voice',
    vendor: 'openai',
    model: SPEECH_MODEL,
    input: { text: req.text, voice: req.voice },
    output: audio ? { bytes: audio.length } : null,
    status: audio ? 'ok' : 'error',
    error,
    attempts: 1,
    inputTokens: null,
    outputTokens: null,
    ms: Date.now() - started,
    createdBy: req.createdBy,
  });
  if (!audio) throw new Error(error!);
  return audio;
}
