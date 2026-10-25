// The builders that are not wired yet (Stage 9 seats). Each keeps the BuilderDriver interface, so wiring
// one is writing its lift(): run the agent in the product's folder with prompts/build.v1.md as its
// instructions and the LiftInput as JSON, let it commit once, read its JSON answer, and record one
// model_calls row through packages/model. Until then each says so in the console and builds nothing.
import { BuilderNotWired, type BuilderDriver, type BuilderId } from './types.ts';

const stub = (id: BuilderId, label: string, vendor: string): BuilderDriver => ({
  id,
  label,
  wired: false,
  lift: () =>
    Promise.reject(
      new BuilderNotWired(
        `${label} (${vendor}) is not wired as a builder yet, so it cannot build. Choose Claude Code as the builder in Settings → Brains.`,
      ),
    ),
});

export const codex = stub('codex', 'Codex', 'OpenAI');
export const geminiCli = stub('gemini-cli', 'Gemini CLI', 'Google');
export const antigravity = stub('antigravity', 'Antigravity', 'Google');
