// A file of a product as the code level shows it (Stage 11): its text now or at a commit, its change at
// that commit (for the typing in replay), its blocks, the plain English beside each, and the figures it
// works out or shows, each a way to its trail. Read from git and the product's own files only.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SiteLocation } from '@rama/blueprint/site';
import { readCapture, readConvention } from '@rama/trace';
import { splitBlocks, type Block } from './blocks.ts';
import { explanationsFor, type BlockFigure, type Explanation } from './explain.ts';

const git = (repoDir: string, args: string[]) =>
  execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 16 * 1024 * 1024,
  });

/** A file's text at a commit; null when it was not there. Without a commit, as it is in the checkout. */
export function fileAt(repoDir: string, file: string, commit?: string): string | null {
  if (!commit) {
    const p = path.join(repoDir, file);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }
  try {
    return git(repoDir, ['show', `${commit}:${file}`]);
  } catch {
    return null;
  }
}

/** What a commit did to a file: its text before (at the parent) and after. */
export function changeAt(repoDir: string, file: string, commit: string) {
  let parent: string | null;
  try {
    parent = git(repoDir, ['rev-parse', `${commit}^`]).trim();
  } catch {
    parent = null; // the first commit
  }
  return {
    path: file,
    before: parent ? fileAt(repoDir, file, parent) : null,
    after: fileAt(repoDir, file, commit),
  };
}

/** The figures of the product, by id: their words and the function that works each out (rama/figures.ts). */
export function productFigures(
  repoDir: string,
): Map<string, BlockFigure & { file: string; fn: string }> {
  const reading = existsSync(path.join(repoDir, 'rama/figures.ts'))
    ? readConvention(repoDir, 'rama/figures.ts')
    : null;
  return new Map(
    Object.entries(reading?.mappings ?? {}).map(([id, m]) => [
      id,
      { id, title: m.title ?? id, what: m.what ?? '', file: m.file, fn: m.fn },
    ]),
  );
}

/** The figures a block serves: the one it works out (its function), and those it shows by id. */
export function figuresOfBlock(
  file: string,
  b: Block,
  figures: Map<string, BlockFigure & { file: string; fn: string }>,
): BlockFigure[] {
  const out = new Map<string, BlockFigure>();
  for (const f of figures.values()) if (f.file === file && b.name === f.fn) out.set(f.id, f);
  for (const m of b.text.matchAll(/<Figure[^>]*\bid=["']([a-z0-9-]+)["']/g)) {
    const f = figures.get(m[1]!);
    if (f) out.set(f.id, f);
  }
  return [...out.values()].map(({ id, title, what }) => ({ id, title, what }));
}

export interface CodeView {
  path: string;
  commit: string | null;
  source: string;
  blocks: (Pick<Block, 'kind' | 'name' | 'from' | 'to' | 'hash'> & {
    explanation: Explanation;
    figures: (BlockFigure & { href: string | null })[];
  })[];
  /** The change the commit made to it, for the typing; null when shown as it is now. */
  change: { before: string | null; after: string | null } | null;
}

/** A file as the code level shows it, now or at a commit. Null when the file is not there. */
export function codeView(
  site: SiteLocation,
  file: string,
  opts: { commit?: string; href?: (figureKey: string) => string; env?: NodeJS.ProcessEnv } = {},
): CodeView | null {
  const source = fileAt(site.repoDir, file, opts.commit);
  if (source === null) return null;
  const blocks = splitBlocks(file, source);
  const figures = productFigures(site.repoDir);
  const explanations = explanationsFor(site, blocks, {
    ...(opts.commit ? { commit: opts.commit } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  });
  // A figure's trail is kept per appearance on a screen; the first one stands for it here.
  const capture = readCapture(site.id, opts.env);
  const keyOf = (id: string) => {
    for (const s of capture?.screens ?? [])
      if (s.figures.some((f) => f.id === id)) return `${s.name}/${id}`;
    return null;
  };
  return {
    path: file,
    commit: opts.commit ?? null,
    source,
    blocks: blocks.map((b, i) => ({
      kind: b.kind,
      name: b.name,
      from: b.from,
      to: b.to,
      hash: b.hash,
      explanation: explanations[i]!,
      // At a commit the figures file may have said otherwise: figures are shown for the file as it is now.
      figures: (opts.commit ? [] : figuresOfBlock(file, b, figures)).map((f) => {
        const key = keyOf(f.id);
        return { ...f, href: key && opts.href ? opts.href(key) : null };
      }),
    })),
    change: opts.commit ? changeAt(site.repoDir, file, opts.commit) : null,
  };
}
