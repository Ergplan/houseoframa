// The builders a product can name (Stage 9 seats): Claude Code wired, three stubs, and the recorded one.
import { claudeCode } from './claude-code.ts';
import { recorded } from './recorded.ts';
import { antigravity, codex, geminiCli } from './stubs.ts';
import type { BuilderDriver, BuilderId } from './types.ts';

export * from './types.ts';
export { BUILD_PROMPT, BUILDER_GIT, claudeCode, claudeCodeHere } from './claude-code.ts';
export { readRecording, recorded, Recording } from './recorded.ts';
export { antigravity, codex, geminiCli } from './stubs.ts';

/** The driver for a builder seat. `model` is the seat's model; `recording` the folder a recorded one replays. */
export function builderFor(
  id: BuilderId,
  opts: { model?: string; recording?: string; env?: NodeJS.ProcessEnv } = {},
): BuilderDriver {
  switch (id) {
    case 'claude-code':
      return claudeCode({ model: opts.model ?? 'claude-sonnet-5-5', env: opts.env });
    case 'recorded':
      if (!opts.recording) throw new Error('a recorded builder needs its recording');
      return recorded(opts.recording);
    case 'codex':
      return codex;
    case 'gemini-cli':
      return geminiCli;
    case 'antigravity':
      return antigravity;
  }
}
