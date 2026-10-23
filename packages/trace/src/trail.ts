// trail(figure) → the path from a figure on a screen back to its formula, inputs, data, build history and
// signature. Plain code (Invariant 6): it reads the Blueprint, the figure's mapping, what the screen
// showed and what re-executing the target's own function gave. A value it does not have stays null.
import type { Blueprint, Signoff, Trail } from '@rama/shared';
import type { FigureMapping } from './config.ts';

export interface RunResult {
  ok: boolean;
  /** The figure as re-execution formats it (the target's own formatter), when there is one. */
  text: string | null;
  /** The raw value. */
  value: unknown;
  inputs: { label: string; value: string }[];
  error?: string;
}

export interface TrailSource {
  figureId: string;
  mapping: FigureMapping;
  /** Lines of the formula, read from the file at capture time. */
  code: string;
  /** What the screen showed: the element's text, or its `data-rama-value` when it declares one. */
  shown: string | null;
  run: RunResult | null;
  /** The signature in force on the figure's screen at the captured commit (Stage 4), or null. */
  signoff?: Signoff | null;
}

/** Whitespace and non-breaking spaces do not make two figures different. */
export const normalise = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, '');

export function buildTrail(bp: Blueprint, src: TrailSource): Trail {
  const m = src.mapping;
  const files = [m.file, ...m.files];
  // Newest commit first; within a commit, files in the order git listed them.
  const build = [...bp.commits].reverse().flatMap((c) =>
    c.changes
      .filter((ch) => files.includes(ch.path))
      .map((ch) => ({
        sha: c.sha,
        at: c.at,
        author: c.author,
        subject: c.subject,
        file: ch.path,
      })),
  );
  const run = src.run?.ok ? src.run : null;
  const valueOf = (label: string) => run?.inputs.find((i) => i.label === label)?.value ?? null;
  const computed = run
    ? (run.text ?? (run.value === null || run.value === undefined ? null : String(run.value)))
    : null;
  const trail: Trail = {
    figureId: src.figureId,
    title: m.title ?? src.figureId,
    what: m.what ?? '',
    formula: { english: m.english ?? '', code: src.code, file: m.file, line: m.line },
    inputs: m.inputs.map((i) => ({ label: i.label, value: valueOf(i.label), source: i.source })),
    data: m.inputs.map((i) => (i.data ? `${i.label}: ${i.data}` : `${i.label}: not recorded`)),
    build,
    signoff: src.signoff ?? null,
    reexecuted: run !== null,
    result: {
      shown: src.shown,
      computed,
      matches:
        src.shown !== null && computed !== null
          ? normalise(src.shown) === normalise(computed)
          : null,
    },
  };
  if (!run) trail.reexecutionError = src.run?.error ?? 'no way to re-execute this figure was given';
  return trail;
}
