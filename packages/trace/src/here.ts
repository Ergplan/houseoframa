// This package's source directory, for the files it runs beside its code (the sandbox runner, the page
// script). Under Node and tsx it is import.meta.dirname. Inside the app's server bundle that is undefined
// and import.meta.url names the bundle, so the checkout is found from the working directory instead.
import { existsSync } from 'node:fs';
import path from 'node:path';

export function traceSrcDir(): string {
  if (import.meta.dirname) return import.meta.dirname;
  let dir = process.env.RAMA_HOME ? path.resolve(process.env.RAMA_HOME) : process.cwd();
  for (;;) {
    const src = path.join(dir, 'packages/trace/src');
    if (existsSync(path.join(src, 'sandbox-runner.mjs'))) return src;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('cannot find packages/trace: set RAMA_HOME');
    dir = up;
  }
}
