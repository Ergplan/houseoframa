// Screens: the pages of every Next.js App Router app in the repository. An app root is a directory
// holding `app/` (or `src/app/`) beside a next.config.* file or a package.json that depends on next.
import path from 'node:path';
import type { ImportEdge, Screen } from '@rama/shared';
import { byString } from './json.ts';

const posix = path.posix;
const PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const LAYOUT = /^layout\.(tsx|ts|jsx|js)$/;

export function findAppRoots(files: string[], read: (p: string) => string | null): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const base = posix.basename(f);
    const dir = posix.dirname(f) === '.' ? '' : posix.dirname(f);
    if (/^next\.config\.(js|mjs|cjs|ts|mts)$/.test(base)) dirs.add(dir);
    if (base === 'package.json') {
      try {
        const pkg = JSON.parse(read(f) ?? '{}') as Record<string, Record<string, string> | undefined>;
        if (pkg.dependencies?.next || pkg.devDependencies?.next) dirs.add(dir);
      } catch {
        // an unparseable manifest names no app
      }
    }
  }
  const roots: string[] = [];
  for (const dir of dirs) {
    for (const sub of ['app', 'src/app']) {
      const root = dir ? `${dir}/${sub}` : sub;
      if (files.some((f) => f.startsWith(`${root}/`) && PAGE.test(posix.basename(f)))) roots.push(root);
    }
  }
  return roots.sort(byString);
}

/** Route pattern for a page file under an app root, or null when the folder is not routable. */
export function routeFor(appRoot: string, pageFile: string): string | null {
  const rel = posix.dirname(pageFile.slice(appRoot.length + 1));
  const segments = rel === '.' ? [] : rel.split('/');
  const route: string[] = [];
  for (const s of segments) {
    if (s.startsWith('_')) return null; // private folder
    if (s.startsWith('@')) return null; // parallel route slot: rendered inside a parent page
    if (/^\(\.{1,3}\)/.test(s)) return null; // intercepting route
    if (s.startsWith('(') && s.endsWith(')')) continue; // route group
    route.push(s);
  }
  return '/' + route.join('/');
}

function nameFor(route: string): string {
  if (route === '/') return 'Home';
  return route
    .slice(1)
    .split('/')
    .map((s) => (s.startsWith('[') ? s : s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')))
    .join(' › ');
}

/** Bricks reachable from `start` over runtime import edges (type-only edges render nothing). */
function closure(start: string[], edges: ImportEdge[]): string[] {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (e.typeOnly) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length) {
    for (const next of out.get(queue.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].sort(byString);
}

export function findScreens(files: string[], edges: ImportEdge[], read: (p: string) => string | null): Screen[] {
  const roots = findAppRoots(files, read);
  const screens: Screen[] = [];
  for (const root of roots) {
    for (const file of files) {
      if (!file.startsWith(`${root}/`) || !PAGE.test(posix.basename(file))) continue;
      const route = routeFor(root, file);
      if (route === null) continue;
      // The page renders inside every layout on the way down from the app root.
      const layouts: string[] = [];
      let dir = posix.dirname(file);
      for (;;) {
        const layout = files.find((f) => posix.dirname(f) === dir && LAYOUT.test(posix.basename(f)));
        if (layout) layouts.push(layout);
        if (dir === root) break;
        dir = posix.dirname(dir);
      }
      screens.push({
        id: roots.length > 1 ? `${root}:${route}` : route,
        name: nameFor(route),
        route,
        file,
        bricks: closure([file, ...layouts], edges),
      });
    }
  }
  return screens.sort((a, b) => byString(a.id, b.id));
}
