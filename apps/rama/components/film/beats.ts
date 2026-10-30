// A lift as the film plays it (Stage 13): beats in the order the builder's stream showed them. Pure, so
// it is tested without a browser.
import type { FilmLift } from '@rama/workbench';

/** One beat of a lift as the film plays it. */
export type Beat =
  | { kind: 'say'; text: string; source: 'builder' | 'commit' }
  | { kind: 'act'; tool: string; target: string | null }
  | { kind: 'file'; index: number }
  | { kind: 'checked' };

const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * A lift as beats: what the builder said and did in the order its stream showed (its words, the tools it
 * used, each file typed in when it wrote it), then any file it changed that the stream did not show, then
 * the checks. Without a kept stream: its words for the lift, its files, the checks.
 */
export function liftBeats(l: FilmLift): Beat[] {
  const out: Beat[] = [];
  const typed = new Set<number>();
  const fileOf = (target: string | null) =>
    target ? l.files.findIndex((f) => target === f.path || target.endsWith(`/${f.path}`)) : -1;
  if (l.narration.length) {
    for (const n of l.narration) {
      if (n.kind === 'said') out.push({ kind: 'say', text: n.text, source: 'builder' });
      else if (n.kind === 'tool') {
        const i = WRITES.has(n.tool ?? '') ? fileOf(n.target ?? null) : -1;
        if (i >= 0 && !typed.has(i)) {
          typed.add(i);
          out.push({ kind: 'file', index: i });
        } else if (i < 0)
          out.push({ kind: 'act', tool: n.tool ?? n.text, target: n.target ?? null });
      }
    }
    if (l.said?.source === 'builder')
      out.push({ kind: 'say', text: l.said.text, source: 'builder' });
  } else if (l.said) out.push({ kind: 'say', text: l.said.text, source: l.said.source });
  l.files.forEach((_, i) => {
    if (!typed.has(i)) out.push({ kind: 'file', index: i });
  });
  out.push({ kind: 'checked' });
  return out;
}

/** A tool the builder used, in plain words. */
export function actWords(tool: string, target: string | null): string {
  const t = target ? ` ${target.length > 80 ? `…${target.slice(-78)}` : target}` : '';
  switch (tool) {
    case 'Read':
      return `read${t}`;
    case 'Glob':
    case 'Grep':
      return `looked for${t}`;
    case 'Bash':
      return `ran${t}`;
    default:
      return `${tool.toLowerCase()}${t}`;
  }
}
