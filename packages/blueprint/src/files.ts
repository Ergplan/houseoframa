// Which tracked files are code. Kept apart from the parser so the metrics (and the app that imports
// them in the browser) do not pull in the TypeScript compiler.

export const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export function isCode(path: string): boolean {
  return CODE_EXTENSIONS.some((ext) => path.endsWith(ext)) && !path.endsWith('.d.ts');
}
