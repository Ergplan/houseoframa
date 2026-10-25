// runAgent(): a builder agent run, through the same door as every model call (rule 8). One run is one
// lift: Claude Code works in the product's folder with a versioned prompt (prompts/<name>.v<N>.md) and
// the input as JSON, with retries, and one model_calls row per run, whatever happened.
//
// The agent gets only what the lift needs: the product's folder, PATH, a home of its own (so no person's
// settings, notes or sign-ins reach it) and the builder seat's key. It may read and edit files in the
// folder and run the product's own checks and git; it may not reach the web, push or install.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { z } from 'zod';
import { createDb, modelCalls, secretFor, type SecretName } from '@rama/db';
import { MAX_ATTEMPTS, OutputParseError, type ModelCallRow } from './call.ts';
import { loadPrompt, PROMPTS_DIR } from './prompts.ts';

/** What the agent may do in the product's folder, and what it may not. */
export const AGENT_TOOLS = {
  allowed: [
    'Read',
    'Edit',
    'Write',
    'Glob',
    'Grep',
    'Bash(git status:*)',
    'Bash(git diff:*)',
    'Bash(git log:*)',
    'Bash(git show:*)',
    'Bash(git add:*)',
    'Bash(git commit:*)',
    'Bash(git rm:*)',
    'Bash(git mv:*)',
    'Bash(npm test:*)',
    'Bash(npm run lint:figures:*)',
    'Bash(npm run typecheck:*)',
    'Bash(npm run build:*)',
    'Bash(node rama/lint.ts:*)',
    'Bash(npx tsc:*)',
    'Bash(npx vitest:*)',
    'Bash(ls:*)',
    'Bash(mkdir:*)',
    'Bash(rm:*)',
    'Bash(mv:*)',
    'Bash(cat:*)',
  ],
  denied: [
    'WebFetch',
    'WebSearch',
    'Bash(git push:*)',
    'Bash(git remote:*)',
    'Bash(npm install:*)',
    'Bash(npm i:*)',
    'Bash(curl:*)',
    'Bash(wget:*)',
  ],
};

export interface AgentRequest<I, O> {
  name: string;
  version: number;
  input: I;
  output: z.ZodType<O>;
  /** The folder the agent works in: the product's checkout. */
  cwd: string;
  /** A home for the agent's own settings, kept apart from any person's. */
  home: string;
  siteId: string;
  createdBy: string;
  /** The model the builder seat names. */
  model: string;
  /** The key the builder seat needs. */
  keyName: SecretName;
  /** Continues an earlier run's conversation, so the agent remembers the lifts before. */
  session?: string | null;
  timeoutMs?: number;
  /** More environment for the agent: never a secret (the key is added from Settings). */
  env?: Record<string, string>;
}

export interface AgentResult<O> {
  output: O;
  callId: string;
  session: string | null;
  attempts: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface Spawned {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface AgentDeps {
  secret: (name: SecretName) => Promise<string | undefined>;
  promptsDir: string;
  record: (row: ModelCallRow) => Promise<string>;
  /** Runs the agent program; resolves when it exits. */
  run: (
    args: string[],
    opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
  ) => Promise<Spawned>;
  sleep: (ms: number) => Promise<void>;
  /** The Claude Code program: CLAUDE_BIN, else `claude` on the PATH. */
  bin: string;
}

export const runProgram =
  (bin: string): AgentDeps['run'] =>
  (args, opts) =>
    new Promise((resolve) => {
      const child = spawn(bin, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs);
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: null, stdout, stderr: stderr + String(err.message) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });

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

const defaultDeps = (): AgentDeps => {
  const bin = process.env.CLAUDE_BIN || 'claude';
  return {
    secret: (name) => secretFor(name),
    promptsDir: PROMPTS_DIR,
    record: recordToDb,
    run: runProgram(bin),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    bin,
  };
};

/** Claude Code's answer with `--output-format json`. */
interface RunReport {
  result?: string;
  is_error?: boolean;
  subtype?: string;
  session_id?: string;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** The last JSON object in the agent's last message: its answer. */
export function lastJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!);
  for (const c of [...fenced.reverse(), text.trim()]) {
    try {
      return JSON.parse(c.trim());
    } catch {
      // not this one
    }
  }
  for (let i = text.lastIndexOf('{'); i >= 0; i = text.lastIndexOf('{', i - 1)) {
    try {
      return JSON.parse(text.slice(i, text.lastIndexOf('}') + 1));
    } catch {
      // keep looking further back
    }
  }
  throw new OutputParseError(`the agent's last message holds no JSON: ${text.slice(-500)}`);
}

export async function runAgent<I, O>(
  req: AgentRequest<I, O>,
  overrides: Partial<AgentDeps> = {},
): Promise<AgentResult<O>> {
  const deps = { ...defaultDeps(), ...overrides };
  const prompt = await loadPrompt(req.name, req.version, deps.promptsDir);
  const key = await deps.secret(req.keyName);
  if (!key) throw new Error(`${req.keyName} is not set: enter the builder's key in Settings`);
  mkdirSync(req.home, { recursive: true });
  const env = {
    ...req.env,
    PATH: process.env.PATH ?? '',
    HOME: req.home,
    [req.keyName]: key,
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  } as unknown as NodeJS.ProcessEnv;
  const started = Date.now();
  let session = req.session ?? null;
  let attempts = 0;
  let output: O | undefined;
  let lastError: unknown;
  let report: RunReport | null = null;
  let costUsd: number | null = null;
  // After a run that worked but did not answer, the retry only asks for the answer: a second lift is
  // never started by a retry.
  let askAgain: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const args = [
      '-p',
      askAgain ?? JSON.stringify(req.input),
      '--output-format',
      'json',
      '--model',
      req.model,
      '--append-system-prompt',
      prompt.text,
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      ...AGENT_TOOLS.allowed,
      '--disallowedTools',
      ...AGENT_TOOLS.denied,
      ...(session ? ['--resume', session] : []),
    ];
    try {
      const out = await deps.run(args, {
        cwd: req.cwd,
        env,
        timeoutMs: req.timeoutMs ?? 30 * 60_000,
      });
      try {
        report = JSON.parse(out.stdout) as RunReport;
      } catch {
        throw new Error(
          `the builder ended without a report (exit ${out.code}): ${(out.stderr || out.stdout).slice(-400)}`,
        );
      }
      session = report.session_id ?? session;
      // Each attempt that ran was billed: its cost and tokens are added up.
      if (typeof report.total_cost_usd === 'number')
        costUsd = (costUsd ?? 0) + report.total_cost_usd;
      const u = report.usage;
      if (u) {
        inputTokens =
          (inputTokens ?? 0) +
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0);
        outputTokens = (outputTokens ?? 0) + (u.output_tokens ?? 0);
      }
      if (report.is_error)
        throw new Error(
          `the builder stopped: ${report.subtype ?? 'error'}: ${String(report.result ?? '').slice(0, 300)}`,
        );
      const parsed = req.output.safeParse(lastJson(report.result ?? ''));
      if (!parsed.success)
        throw new OutputParseError(`the builder's answer does not match: ${parsed.error.message}`);
      output = parsed.data;
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof OutputParseError && session)
        askAgain =
          'Your last message was not the JSON answer the instructions ask for. Change nothing; reply with only that JSON now.';
      if (attempts >= MAX_ATTEMPTS) break;
      await deps.sleep(2000 * 2 ** (attempts - 1));
    }
  }

  const ok = lastError === undefined;
  const callId = await deps.record({
    siteId: req.siteId,
    prompt: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    role: 'builder',
    vendor: 'anthropic',
    model: req.model,
    input: req.input as object,
    output: {
      ...(ok ? { answer: output as object } : { unparsed: report?.result ?? null }),
      driver: 'claude-code',
      session,
      costUsd,
      turns: report?.num_turns ?? null,
    },
    status: ok ? 'ok' : 'error',
    error: ok ? null : String((lastError as Error)?.message ?? lastError),
    attempts,
    inputTokens,
    outputTokens,
    ms: Date.now() - started,
    createdBy: req.createdBy,
  });
  if (!ok) throw lastError;
  return { output: output as O, callId, session, attempts, costUsd, inputTokens, outputTokens };
}
