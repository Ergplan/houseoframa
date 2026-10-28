// extract(repoPath, opts) → Blueprint. Reads only git and the file tree; no model call, no clock,
// no network (Invariant 6). The same commit always yields byte-identical canonical JSON.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import type { Blueprint, BrickNode, ImportEdge, Table } from '@rama/shared';
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
  /**
   * Where the `.rama/` overlays are read from. `commit` (default) reads them from the extracted commit;
   * `worktree` reads them from the working copy while code, history and refs still come from the commit:
   * a site's Blueprint shows confirmations made since its last commit.
   */
  overlay?: 'commit' | 'worktree';
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

/** A purpose from `.rama/purposes.json`: confirmed only with both a confirmer and a date (Invariant 6). */
function purposeOf(entry: Glossary[string] | undefined): Pick<BrickNode, 'purpose'> {
  if (!entry) return {};
  const confirmed = Boolean(entry.confirmedBy && entry.confirmedAt);
  return {
    purpose: confirmed
      ? { text: entry.text, confirmed, by: entry.confirmedBy!, at: entry.confirmedAt! }
      : { text: entry.text, confirmed },
  };
}

/** The package a bare import specifier names (`next/link` → `next`, `@a/b/c` → `@a/b`); null for Node's own modules. */
export function packageName(spec: string): string | null {
  if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/')) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
  if (!name || builtinModules.includes(name)) return null;
  return name;
}

/**
 * The tables each file uses: through a runtime import of the file that defines them, or of a file that
 * re-exports them (`export * from './schema'`), by the names the file imports (`*` imports by the members
 * it reads off the namespace). The defining file itself is not counted as a use.
 */
function tableUse(
  edges: ImportEdge[],
  facts: Map<string, ReturnType<typeof parseSource>>,
  tables: Table[],
  reexports: Map<string, { to: string; symbols: string[] }[]>,
): Map<string, { name: string; reads: boolean; writes: boolean }[]> {
  // The tables a file offers its importers, by exported name: its own and those it passes through.
  const offered = (file: string, seen: Set<string>): Map<string, Table> => {
    const m = new Map(tables.filter((t) => t.file === file).map((t) => [t.symbol, t]));
    if (seen.has(file)) return m;
    seen.add(file);
    for (const r of reexports.get(file) ?? []) {
      for (const [sym, t] of offered(r.to, seen)) if (r.symbols.includes('*') || r.symbols.includes(sym)) m.set(sym, t);
    }
    return m;
  };
  const out = new Map<string, Map<string, { name: string; reads: boolean; writes: boolean }>>();
  for (const e of edges) {
    if (e.typeOnly) continue;
    const uses = facts.get(e.from)?.uses ?? {};
    for (const [sym, t] of offered(e.to, new Set())) {
      if (!e.symbols.includes(sym) && !e.symbols.includes('*')) continue;
      const u = uses[sym];
      if (!u) continue;
      const m = out.get(e.from) ?? new Map();
      const prev = m.get(t.name) ?? { name: t.name, reads: false, writes: false };
      m.set(t.name, { name: t.name, reads: prev.reads || u.reads, writes: prev.writes || u.writes });
      out.set(e.from, m);
    }
  }
  return new Map([...out].map(([p, m]) => [p, [...m.values()].sort((a, b) => byString(a.name, b.name))]));
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

  const readOverlayFile =
    opts.overlay === 'worktree' && !opts.worktree
      ? (p: string) => (existsSync(path.join(root, p)) ? readFileSync(path.join(root, p), 'utf8') : null)
      : read;
  const plan = planLayers(readOverlay(readOverlayFile, '.rama/layers.json', LayersOverlaySchema) as LayersOverlay | null);
  const glossary = { ...opts.glossaryExtra, ...readOverlay(readOverlayFile, '.rama/glossary.json', Glossary) };
  const purposes = readOverlay(readOverlayFile, '.rama/purposes.json', Glossary) ?? {};
  const resolver = new Resolver({ files: new Set(paths), read });

  const edgeMap = new Map<string, ImportEdge>();
  const unresolved = new Map<string, { from: string; spec: string }>();
  const facts = new Map<string, ReturnType<typeof parseSource>>();
  const packagesOf = new Map<string, Set<string>>();
  const reexports = new Map<string, { to: string; symbols: string[] }[]>();
  for (const p of paths) {
    const source = texts.get(p);
    if (source === undefined || !isCode(p)) continue;
    const f = parseSource(p, source);
    facts.set(p, f);
    for (const imp of f.imports) {
      const r = resolver.resolve(p, imp.spec);
      if (r.kind === 'unresolved') unresolved.set(`${p}\0${imp.spec}`, { from: p, spec: imp.spec });
      if (r.kind === 'external' && !imp.typeOnly) {
        const name = packageName(imp.spec);
        if (name) packagesOf.set(p, (packagesOf.get(p) ?? new Set()).add(name));
      }
      if (r.kind !== 'internal' || r.path === p) continue;
      if (imp.reexport && !imp.typeOnly) reexports.set(p, [...(reexports.get(p) ?? []), { to: r.path, symbols: imp.symbols }]);
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

  const defs = [...facts.entries()].flatMap(([file, f]) => f.tables.map((t) => ({ file, t })));
  // A reference as written (`sites.siteId`) to the table and column it names (`sites.site_id`): the
  // table of that symbol in the same file, else the only one of that symbol anywhere; else as written.
  const pointsAt = (file: string, ref: string) => {
    const m = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(ref);
    if (!m) return ref;
    const same = defs.filter((d) => d.t.symbol === m[1]);
    const to = same.find((d) => d.file === file)?.t ?? (same.length === 1 ? same[0]!.t : null);
    const col = to?.fields.find((c) => c.key === m[2]);
    return to && col ? `${to.name}.${col.name}` : ref;
  };
  const tables: Table[] = defs
    .map(({ file, t }) => ({
      name: t.name,
      file,
      line: t.line,
      symbol: t.symbol,
      columns: t.columns,
      fields: t.fields.map((c) => (c.references ? { ...c, references: pointsAt(file, c.references) } : c)),
      ...(t.unread.length ? { unread: t.unread } : {}),
    }))
    .sort((a, b) => byString(a.file, b.file) || byString(a.name, b.name));
  const tablesOf = tableUse(edges, facts, tables, reexports);

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
      ...(packagesOf.has(p) ? { packages: [...packagesOf.get(p)!].sort(byString) } : {}),
      ...(f?.hosts.length ? { hosts: f.hosts } : {}),
      ...(tablesOf.has(p) ? { tables: tablesOf.get(p)! } : {}),
      ...purposeOf(purposes[p]),
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
    tables,
  };
}
