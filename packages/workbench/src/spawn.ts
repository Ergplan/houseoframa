// A child process run without holding the app (Stage 12): the build's long steps (the product's
// install, its tests, the push to GitHub) ran with spawnSync inside the app's own process, so every page
// waited for them, for up to a minute and a half a lift. This runs them beside the app instead.
import { spawn, type SpawnOptions } from 'node:child_process';

export interface Ran {
  /** The exit code; null when the process was stopped (the timeout) or could not start. */
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `command args` and resolves when it ends, with what it wrote; it never rejects. */
export function run(
  command: string,
  args: string[],
  options: Omit<SpawnOptions, 'stdio'> & { timeout?: number } = {},
): Promise<Ran> {
  const { timeout, ...rest } = options;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { ...rest, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = timeout ? setTimeout(() => child.kill('SIGTERM'), timeout) : null;
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ status: null, stdout, stderr: stderr + err.message });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}
