// extract(repoPath, opts) → Blueprint. Reads only git and the file tree; no model call, no clock,
// no network (Invariant 6). The same commit always yields byte-identical canonical JSON.
import path from 'node:path';
import type { Blueprint, BrickNode, ImportEdge } from '@rama/shared';
import pkg from '../package.json' with { type: 'json' };
import {
  committerDate,
  originName,
  readBranches,
  readCommitTree,
  readHistory,
  readTags,
  readWorktree,
  revParse,
  topLevel,
  worktreeBase,
  type TreeFile,
} from './git.ts';
import { Glossary, mergeGlossary } from './glossary.ts';
import { byString } from './json.ts';
import { assignLayer, planLayers, type LayersOverlay } from './layers.ts';
import { isCode, parseSource } from './parse.ts';
import { Resolver } from './resolve.ts';
import { findScreens } from './screens.ts';
import { z } from 'zod';

export const EXTRACTOR_VERSION = pkg.version;

export interface ExtractOptions {
  /** Commit to extract (default HEAD). Ignored with `worktree`. */
  rev?: string;
  /** Read the working tree instead of a commit: how a repository carries its own Blueprint. */
  worktree?: boolean;
  /** Globs of tracked paths to leave out (e.g. the Blueprint files themselves). */
  exclude?: string[];
  /** Repository identifier written to `Blueprint.repo` (default: the origin URL without credentials, else the directory name). */
  repo?: string;
  /** Phrases to merge under the target's own `.rama/glossary.json` (whose entries win): fresh drafts. */
  glossaryExtra?: Glossary;
}

const TEST_FILE = /(\.test\.|\.spec\.|__tests__\/)/;

export function isBinary(content: Buffer): boolean {
  return content.subarray(0, 8000).includes(0);
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith('\n') ? n : n + 1;
}

const LayersOverlaySchema = z.object({
  layers: z.array(z.object({ id: z.string().min(1), label: z.string() })).optional(),
  rules: z
    .array(z.object({ layer: z.string().min(1), match: z.array(z.string().min(1)).min(1), name: z.string().optional() }))
    .optional(),
  defaults: z.boolean().optional(),
});

function readOverlay<T>(read: (p: string) => string | null, file: string, schema: z.ZodType<T>): T | null {
  const raw = read(file);
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${file} does not match its schema: ${parsed.error.message}`);
  return parsed.data;
}

export function extract(repoPath: string, opts: ExtractOptions = {}): Blueprint {
  const root = topLevel(path.resolve(repoPath));
  const exclude = opts.exclude ?? [];
  let sha: string | null;
  let tree: TreeFile[];
  if (opts.worktree) {
    sha = worktreeBase(root, exclude);
    tree = readWorktree(root, exclude);
  } else {
    sha = revParse(root, opts.rev ?? 'HEAD');
    if (!sha) throw new Error(`${opts.rev ?? 'HEAD'} is not a commit in ${root}`);
    tree = readCommitTree(root, sha, exclude);
  }

  const texts = new Map<string, string>();
  const binaries = new Set<string>();
  for (const f of tree) {
    if (isBinary(f.content)) binaries.add(f.path);
    else texts.set(f.path, f.content.toString('utf8'));
  }
  const read = (p: string) => texts.get(p) ?? null;
  const sizes = new Map(tree.map((f) => [f.path, f.content.length]));
  const paths = tree.map((f) => f.path);

  const plan = planLayers(readOverlay(read, '.rama/layers.json', LayersOverlaySchema) as LayersOverlay | null);
  const glossary = { ...opts.glossaryExtra, ...readOverlay(read, '.rama/glossary.json', Glossary) };
  const resolver = new Resolver({ files: new Set(paths), read });

  const edgeMap = new Map<string, ImportEdge>();
  const unresolved = new Map<string, { from: string; spec: string }>();
  const facts = new Map<string, ReturnType<typeof parseSource>>();
  for (const p of paths) {
    const source = texts.get(p);
    if (source === undefined || !isCode(p)) continue;
    const f = parseSource(p, source);
    facts.set(p, f);
    for (const imp of f.imports) {
      const r = resolver.resolve(p, imp.spec);
      if (r.kind === 'unresolved') unresolved.set(`${p}\0${imp.spec}`, { from: p, spec: imp.spec });
      if (r.kind !== 'internal' || r.path === p) continue;
      const key = `${p}\0${r.path}`;
      const prev = edgeMap.get(key);
      if (!prev) edgeMap.set(key, { from: p, to: r.path, symbols: [...imp.symbols], typeOnly: imp.typeOnly });
      else {
        prev.symbols = [...new Set([...prev.symbols, ...imp.symbols])];
        prev.typeOnly = prev.typeOnly && imp.typeOnly;
      }
    }
  }
  const edges = mergeGlossary(
    [...edgeMap.values()]
      .map((e) => ({ ...e, symbols: [...e.symbols].sort(byString) }))
      .sort((a, b) => byString(a.from, b.from) || byString(a.to, b.to)),
    glossary,
  );

  const commits = readHistory(root, sha);
  const touched = new Map<string, string[]>();
  for (const c of commits) {
    for (const ch of c.changes) touched.set(ch.path, [...(touched.get(ch.path) ?? []), c.sha]);
  }

  const nodes: BrickNode[] = paths.map((p) => {
    const f = facts.get(p);
    const history = touched.get(p) ?? [];
    const { layer, rule } = assignLayer(plan, p);
    return {
      path: p,
      layer,
      layerRule: rule,
      lines: binaries.has(p) ? 0 : countLines(texts.get(p)!),
      bytes: sizes.get(p)!,
      binary: binaries.has(p),
      test: TEST_FILE.test(p),
      exports: f?.exports ?? [],
      env: f?.env ?? [],
      envDynamic: f?.envDynamic ?? false,
      firstCommit: history[0] ?? '',
      lastCommit: history.at(-1) ?? '',
      changes: history.length,
    };
  });

  const external: Blueprint['external'] = [];
  for (const p of paths) {
    if (p !== 'package.json' && !p.endsWith('/package.json')) continue;
    let manifest: Record<string, Record<string, string> | undefined>;
    try {
      manifest = JSON.parse(texts.get(p) ?? '');
    } catch {
      continue;
    }
    for (const [field, dev] of [['dependencies', false], ['devDependencies', true]] as const) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (typeof version === 'string') external.push({ name, version, dev, manifest: p });
      }
    }
  }
  external.sort((a, b) => byString(a.manifest, b.manifest) || byString(a.name, b.name) || Number(a.dev) - Number(b.dev));

  return {
    repo: opts.repo ?? originName(root) ?? path.basename(root),
    commit: sha ?? '',
    worktree: Boolean(opts.worktree),
    extractedAt: sha ? committerDate(root, sha) : '',
    extractorVersion: EXTRACTOR_VERSION,
    layers: plan.layers,
    nodes,
    edges,
    unresolved: [...unresolved.values()].sort((a, b) => byString(a.from, b.from) || byString(a.spec, b.spec)),
    external,
    commits,
    branches: opts.worktree || !sha ? [] : readBranches(root, sha),
    tags: opts.worktree || !sha ? [] : readTags(root, sha),
    screens: findScreens(paths, edges, read),
  };
}
