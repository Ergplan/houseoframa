// Claude Code as the builder: one run per lift in the product's folder, through packages/model
// (runAgent), continuing the same conversation from lift to lift.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { workDir } from '@rama/blueprint/site';
import { runAgent, type AgentDeps } from '@rama/model';
import { BuilderNotWired, LiftAnswer, type BuilderDriver } from './types.ts';

/** Whether Claude Code is on this computer: `claude` on the PATH, or CLAUDE_BIN. */
export function claudeCodeHere(env: NodeJS.ProcessEnv = process.env): boolean {
  const r = spawnSync(env.CLAUDE_BIN || 'claude', ['--version'], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  return r.status === 0;
}

/** Who the builder's lifts are by, in the product's history. */
export const BUILDER_GIT = (label: string) => ({
  GIT_AUTHOR_NAME: `${label} (builder)`,
  GIT_AUTHOR_EMAIL: 'builder@houseoframa.local',
  GIT_COMMITTER_NAME: `${label} (builder)`,
  GIT_COMMITTER_EMAIL: 'builder@houseoframa.local',
});

export const BUILD_PROMPT = { name: 'build', version: 3 } as const;

export function claudeCode(
  opts: { model: string; env?: NodeJS.ProcessEnv; deps?: Partial<AgentDeps> } = {
    model: 'claude-sonnet-5-5',
  },
): BuilderDriver {
  const env = opts.env ?? process.env;
  return {
    id: 'claude-code',
    label: 'Claude Code',
    wired: true,
    async lift(req) {
      if (!claudeCodeHere(env))
        throw new BuilderNotWired(
          'Claude Code is not on this computer, so it cannot build here. An engineer installs it where House of Rama runs.',
        );
      const r = await runAgent(
        {
          ...BUILD_PROMPT,
          input: req.input,
          output: LiftAnswer,
          cwd: req.repoDir,
          home: path.join(workDir(env), '.builder-home'),
          siteId: req.siteId,
          createdBy: req.createdBy,
          model: opts.model,
          keyName: 'ANTHROPIC_API_KEY',
          session: req.session,
          env: BUILDER_GIT('Claude Code'),
          ...(req.onEvent ? { onEvent: req.onEvent } : {}),
        },
        opts.deps,
      );
      return { answer: r.output, session: r.session, callId: r.callId, costUsd: r.costUsd };
    },
  };
}
