// A builder agent run (rule 8): one model_calls row per run, the key from Settings and nothing else of
// House of Rama's in the agent's environment, the conversation continued, and a retry that only asks for
// the answer so a second lift is never started by it.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AGENT_TOOLS, lastJson, runAgent, type AgentDeps } from './agent.ts';
import type { ModelCallRow } from './call.ts';

const promptsDir = fileURLToPath(new URL('../test/fixtures/prompts', import.meta.url));
const Answer = z.object({ said: z.string(), done: z.boolean() });
const report = (result: string, extra: object = {}) =>
  JSON.stringify({
    result,
    session_id: 'sess-1',
    total_cost_usd: 0.25,
    num_turns: 7,
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 5,
      output_tokens: 40,
    },
    ...extra,
  });

function deps(outputs: string[]) {
  const rows: ModelCallRow[] = [];
  const runs: { args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const d: Partial<AgentDeps> = {
    secret: async (n) => (n === 'ANTHROPIC_API_KEY' ? 'sk-test' : undefined),
    promptsDir,
    sleep: async () => {},
    record: async (row) => {
      rows.push(row);
      return `row-${rows.length}`;
    },
    run: async (args, opts) => {
      runs.push({ args, env: opts.env, cwd: opts.cwd });
      return { code: 0, stdout: outputs.shift() ?? '', stderr: '' };
    },
  };
  return { d, rows, runs };
}

const req = {
  name: 'echo',
  version: 1,
  input: { ask: 'next' },
  output: Answer,
  cwd: '/products/chai',
  home: '/tmp/rama-builder-home-test',
  siteId: 'chai',
  createdBy: 'rama:test@0',
  model: 'claude-sonnet-5-5',
  keyName: 'ANTHROPIC_API_KEY' as const,
  env: { GIT_AUTHOR_NAME: 'Claude Code (builder)' },
};

describe('runAgent', () => {
  it('runs the agent in the product’s folder with the prompt, the key and its own home, and records one row', async () => {
    const { d, rows, runs } = deps([
      report('Done.\n```json\n{"said":"Built the orders page.","done":false}\n```'),
    ]);
    const r = await runAgent(req, d);
    expect(r).toMatchObject({
      output: { said: 'Built the orders page.', done: false },
      session: 'sess-1',
      costUsd: 0.25,
      attempts: 1,
    });
    expect(runs[0]!.cwd).toBe('/products/chai');
    expect(runs[0]!.env).toEqual({
      GIT_AUTHOR_NAME: 'Claude Code (builder)',
      PATH: process.env.PATH,
      HOME: '/tmp/rama-builder-home-test',
      ANTHROPIC_API_KEY: 'sk-test',
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
    const a = runs[0]!.args;
    expect(a.slice(0, 2)).toEqual(['-p', '{"ask":"next"}']);
    expect(a).toContain('--append-system-prompt');
    for (const denied of ['WebFetch', 'Bash(git push:*)', 'Bash(npm install:*)'])
      expect(a).toContain(denied);
    expect(AGENT_TOOLS.allowed).not.toContain('Bash(git push:*)');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: 'builder',
      vendor: 'anthropic',
      model: 'claude-sonnet-5-5',
      status: 'ok',
      inputTokens: 115,
      outputTokens: 40,
      output: {
        answer: { said: 'Built the orders page.', done: false },
        driver: 'claude-code',
        session: 'sess-1',
        costUsd: 0.25,
      },
    });
  });

  it('continues an earlier conversation, and when the agent does not answer, asks only for the answer', async () => {
    const { d, rows, runs } = deps([
      report('I made the lift.'),
      report('{"said":"Made the lift.","done":true}'),
    ]);
    const r = await runAgent({ ...req, session: 'sess-0' }, d);
    expect(r.output.done).toBe(true);
    expect(runs[0]!.args).toEqual(expect.arrayContaining(['--resume', 'sess-0']));
    expect(runs[1]!.args[1]).toMatch(/^Your last message was not the JSON answer/);
    expect(runs[1]!.args).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    // Both runs were billed: one row, the cost of both.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempts: 2, output: { costUsd: 0.5 } });
  });

  it('records the failure and throws when the agent never answers; refuses to start without the key', async () => {
    const { d, rows } = deps(['not json', 'not json', 'not json']);
    await expect(runAgent(req, d)).rejects.toThrow(/without a report/);
    expect(rows[0]).toMatchObject({ status: 'error', attempts: 3 });
    const none = deps([]);
    await expect(runAgent(req, { ...none.d, secret: async () => undefined })).rejects.toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(none.rows).toHaveLength(0);
  });

  it('finds the answer as the last JSON in a message', () => {
    expect(lastJson('first {"a":1} then {"b":2}')).toEqual({ b: 2 });
    expect(() => lastJson('no answer')).toThrow(/holds no JSON/);
  });
});
