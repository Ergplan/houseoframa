// The text of a brick as the Blueprint saw it: at the Blueprint's commit, or the working copy when the
// Blueprint was extracted from one.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Blueprint } from '@rama/shared';

export type ReadSource = (file: string) => string | null;

export function sourceReader(repoDir: string, bp: Blueprint): ReadSource {
  const cache = new Map<string, string | null>();
  return (file) => {
    if (cache.has(file)) return cache.get(file)!;
    let text: string | null;
    if (bp.worktree) {
      const full = path.join(repoDir, file);
      text = existsSync(full) ? readFileSync(full, 'utf8') : null;
    } else {
      try {
        text = execFileSync('git', ['-C', repoDir, 'show', `${bp.commit}:${file}`], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        text = null;
      }
    }
    cache.set(file, text);
    return text;
  };
}

export function parse(file: string, text: string): ts.SourceFile {
  const kind = /\.(tsx|jsx)$/.test(file)
    ? ts.ScriptKind.TSX
    : /\.(js|mjs|cjs)$/.test(file)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

export const lineOf = (sf: ts.SourceFile, node: ts.Node) =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}
