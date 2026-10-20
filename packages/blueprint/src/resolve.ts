// Turns an import specifier into a tracked file, or says it is external, or says it could not.
// Sources of truth, in order: relative paths; tsconfig `paths` (nearest tsconfig.json up the tree,
// following relative `extends`); workspace packages by their package.json name and `exports`.
import path from 'node:path';
import ts from 'typescript';
import { byString } from './json.ts';

export type Resolution = { kind: 'internal'; path: string } | { kind: 'external' } | { kind: 'unresolved' };

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const INDEXES = EXTENSIONS.filter((e) => e !== '.json' && e !== '.d.ts').map((e) => `/index${e}`);
// TypeScript ESM style: './x.js' in source means './x.ts' on disk.
const JS_TO_TS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

const posix = path.posix;

interface PathsConfig {
  /** Directory the `paths` targets are relative to (baseUrl, or the config's own directory). */
  base: string;
  paths: Record<string, string[]>;
}

interface WorkspacePackage {
  name: string;
  dir: string;
  entries: Record<string, string>; // subpath ('.' or './x') → file relative to dir
}

export interface ResolverInput {
  files: Set<string>;
  /** Reads a tracked text file (for tsconfig.json and package.json). */
  read: (path: string) => string | null;
}

function parseJsonc(text: string): unknown {
  const res = ts.parseConfigFileTextToJson('x.json', text);
  return res.error ? null : res.config;
}

function exportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const key of ['types', 'import', 'default', 'require', 'node']) {
      const t = exportTarget((value as Record<string, unknown>)[key]);
      if (t) return t;
    }
  }
  return null;
}

export class Resolver {
  private files: Set<string>;
  private read: ResolverInput['read'];
  private tsconfigCache = new Map<string, PathsConfig | null>();
  private packages: WorkspacePackage[];

  constructor(input: ResolverInput) {
    this.files = input.files;
    this.read = input.read;
    this.packages = this.findPackages();
  }

  private findPackages(): WorkspacePackage[] {
    const out: WorkspacePackage[] = [];
    for (const f of this.files) {
      if (!f.endsWith('package.json') || (f !== 'package.json' && !f.endsWith('/package.json'))) continue;
      const json = parseJsonc(this.read(f) ?? '') as Record<string, unknown> | null;
      if (!json || typeof json.name !== 'string') continue;
      const dir = posix.dirname(f) === '.' ? '' : posix.dirname(f);
      const entries: Record<string, string> = {};
      const exp = json.exports;
      if (typeof exp === 'string') entries['.'] = exp;
      else if (exp && typeof exp === 'object') {
        const keys = Object.keys(exp);
        if (keys.some((k) => k.startsWith('.'))) {
          for (const k of keys) {
            const t = exportTarget((exp as Record<string, unknown>)[k]);
            if (t) entries[k] = t;
          }
        } else {
          const t = exportTarget(exp);
          if (t) entries['.'] = t;
        }
      }
      for (const key of ['types', 'module', 'main']) {
        if (!entries['.'] && typeof json[key] === 'string') entries['.'] = json[key] as string;
      }
      out.push({ name: json.name, dir, entries });
    }
    return out;
  }

  /** The `paths` in effect for a file: nearest tsconfig.json up the tree, following relative extends. */
  private pathsFor(fromDir: string): PathsConfig | null {
    let dir = fromDir;
    for (;;) {
      const candidate = dir ? `${dir}/tsconfig.json` : 'tsconfig.json';
      if (this.files.has(candidate)) return this.loadTsconfig(candidate);
      if (!dir) return null;
      dir = posix.dirname(dir) === '.' ? '' : posix.dirname(dir);
    }
  }

  private loadTsconfig(file: string, depth = 0): PathsConfig | null {
    if (this.tsconfigCache.has(file)) return this.tsconfigCache.get(file)!;
    let result: PathsConfig | null = null;
    const json = parseJsonc(this.read(file) ?? '') as {
      extends?: string | string[];
      compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string };
    } | null;
    const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
    const co = json?.compilerOptions;
    if (co?.paths) {
      result = { base: posix.normalize(posix.join(dir, co.baseUrl ?? '.')).replace(/^\.$/, ''), paths: co.paths };
    } else if (json?.extends && depth < 10) {
      // Inherit paths from a relative parent config; package configs (e.g. "next/tsconfig") carry none we can see.
      const parents = Array.isArray(json.extends) ? json.extends : [json.extends];
      for (const parent of [...parents].reverse()) {
        if (!parent.startsWith('.')) continue;
        let target = posix.normalize(posix.join(dir, parent));
        if (!target.endsWith('.json')) target += '.json';
        const inherited = this.files.has(target) ? this.loadTsconfig(target, depth + 1) : null;
        if (inherited) {
          result = inherited;
          break;
        }
      }
    }
    this.tsconfigCache.set(file, result);
    return result;
  }

  /** A tracked file for `base` with the usual extension and index candidates, or null. */
  probe(base: string): string | null {
    const clean = posix.normalize(base).replace(/^\.\//, '');
    if (clean.startsWith('..')) return null;
    if (this.files.has(clean)) return clean;
    const ext = posix.extname(clean);
    for (const swap of JS_TO_TS[ext] ?? []) {
      const c = clean.slice(0, -ext.length) + swap;
      if (this.files.has(c)) return c;
    }
    for (const e of EXTENSIONS) if (this.files.has(clean + e)) return clean + e;
    for (const i of INDEXES) if (this.files.has(clean + i)) return clean + i;
    return null;
  }

  resolve(from: string, spec: string): Resolution {
    const fromDir = posix.dirname(from) === '.' ? '' : posix.dirname(from);
    if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
      const hit = this.probe(posix.join(fromDir, spec));
      return hit ? { kind: 'internal', path: hit } : { kind: 'unresolved' };
    }

    const cfg = this.pathsFor(fromDir);
    if (cfg) {
      // As TypeScript does: an exact pattern first, then the wildcard with the longest prefix.
      const prefix = (p: string) => (p.includes('*') ? p.indexOf('*') : Infinity);
      const patterns = Object.keys(cfg.paths).sort((a, b) => prefix(b) - prefix(a) || byString(a, b));
      for (const pattern of patterns) {
        const star = pattern.indexOf('*');
        let captured: string | null = null;
        if (star === -1) captured = pattern === spec ? '' : null;
        else {
          const pre = pattern.slice(0, star);
          const post = pattern.slice(star + 1);
          if (spec.startsWith(pre) && spec.endsWith(post) && spec.length >= pre.length + post.length) {
            captured = spec.slice(pre.length, spec.length - post.length);
          }
        }
        if (captured === null) continue;
        for (const target of cfg.paths[pattern]!) {
          const hit = this.probe(posix.join(cfg.base, target.replace('*', captured)));
          if (hit) return { kind: 'internal', path: hit };
        }
        return { kind: 'unresolved' }; // the alias claims the specifier, so it points inside the repo
      }
    }

    for (const pkg of this.packages) {
      if (spec !== pkg.name && !spec.startsWith(`${pkg.name}/`)) continue;
      const sub = spec === pkg.name ? '.' : `.${spec.slice(pkg.name.length)}`;
      const entry = pkg.entries[sub];
      const hit = entry ? this.probe(posix.join(pkg.dir, entry)) : this.probe(posix.join(pkg.dir, sub));
      return hit ? { kind: 'internal', path: hit } : { kind: 'unresolved' };
    }
    return { kind: 'external' };
  }
}
