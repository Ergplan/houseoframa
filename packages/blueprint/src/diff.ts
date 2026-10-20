// What changed between two Blueprints: `rama diff a.json b.json`, and the detail of a drift failure.
import type { Blueprint } from '@rama/shared';
import { canonicalJson, byString } from './json.ts';
import { summary } from './metrics/index.ts';

export interface BlueprintDiff {
  identical: boolean;
  header: { field: string; a: unknown; b: unknown }[];
  nodes: { added: string[]; removed: string[]; changed: { path: string; fields: string[] }[] };
  edges: { added: string[]; removed: string[]; changed: string[] };
  commits: { a: number; b: number; added: string[] };
  screens: { added: string[]; removed: string[] };
  metrics: { name: string; a: unknown; b: unknown }[];
}

function keyed<T>(items: T[], key: (t: T) => string) {
  return new Map(items.map((t) => [key(t), t]));
}

function setDiff<T>(a: Map<string, T>, b: Map<string, T>) {
  const added = [...b.keys()].filter((k) => !a.has(k)).sort(byString);
  const removed = [...a.keys()].filter((k) => !b.has(k)).sort(byString);
  const common = [...a.keys()].filter((k) => b.has(k)).sort(byString);
  return { added, removed, common };
}

export function diffBlueprints(a: Blueprint, b: Blueprint): BlueprintDiff {
  const header = (['repo', 'commit', 'worktree', 'extractedAt', 'extractorVersion'] as const)
    .filter((f) => a[f] !== b[f])
    .map((field) => ({ field, a: a[field], b: b[field] }));

  const na = keyed(a.nodes, (n) => n.path);
  const nb = keyed(b.nodes, (n) => n.path);
  const nd = setDiff(na, nb);
  const changedNodes = nd.common
    .map((path) => {
      const x = na.get(path)! as unknown as Record<string, unknown>;
      const y = nb.get(path)! as unknown as Record<string, unknown>;
      const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])]
        .filter((f) => canonicalJson(x[f] ?? null) !== canonicalJson(y[f] ?? null))
        .sort(byString);
      return { path, fields };
    })
    .filter((c) => c.fields.length);

  const ek = (e: Blueprint['edges'][number]) => `${e.from} → ${e.to}`;
  const ea = keyed(a.edges, ek);
  const eb = keyed(b.edges, ek);
  const ed = setDiff(ea, eb);

  const shas = new Set(a.commits.map((c) => c.sha));
  const sa = keyed(a.screens, (s) => s.id);
  const sb = keyed(b.screens, (s) => s.id);
  const sd = setDiff(sa, sb);

  const ma = summary(a) as Record<string, unknown>;
  const mb = summary(b) as Record<string, unknown>;
  const metrics = Object.keys(ma)
    .filter((k) => canonicalJson(ma[k] ?? null) !== canonicalJson(mb[k] ?? null))
    .map((name) => ({ name, a: ma[name], b: mb[name] }));

  return {
    identical: canonicalJson(a) === canonicalJson(b),
    header,
    nodes: { added: nd.added, removed: nd.removed, changed: changedNodes },
    edges: {
      added: ed.added,
      removed: ed.removed,
      changed: ed.common.filter((k) => canonicalJson(ea.get(k)) !== canonicalJson(eb.get(k))),
    },
    commits: { a: a.commits.length, b: b.commits.length, added: b.commits.filter((c) => !shas.has(c.sha)).map((c) => c.short) },
    screens: { added: sd.added, removed: sd.removed },
    metrics,
  };
}

export function formatDiff(d: BlueprintDiff): string {
  if (d.identical) return 'identical';
  const lines: string[] = [];
  for (const h of d.header) lines.push(`${h.field}: ${JSON.stringify(h.a)} → ${JSON.stringify(h.b)}`);
  const list = (label: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`${label} (${items.length}):`);
    for (const i of items.slice(0, 20)) lines.push(`  ${i}`);
    if (items.length > 20) lines.push(`  … ${items.length - 20} more`);
  };
  list('bricks added', d.nodes.added);
  list('bricks removed', d.nodes.removed);
  list('bricks changed', d.nodes.changed.map((c) => `${c.path} [${c.fields.join(', ')}]`));
  list('edges added', d.edges.added);
  list('edges removed', d.edges.removed);
  list('edges changed', d.edges.changed);
  if (d.commits.a !== d.commits.b) lines.push(`commits: ${d.commits.a} → ${d.commits.b}`);
  list('screens added', d.screens.added);
  list('screens removed', d.screens.removed);
  for (const m of d.metrics) lines.push(`metric ${m.name}: ${JSON.stringify(m.a)} → ${JSON.stringify(m.b)}`);
  if (!lines.length) lines.push('differs only in ordering or fields outside the summary');
  return lines.join('\n');
}
