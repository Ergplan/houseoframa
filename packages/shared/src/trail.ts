import type { Signoff } from './ceremony.ts';

/** The path from a figure on a screen back to its formula, inputs, data, build history and signature. */
export interface Trail {
  /** The figure this trail explains. */
  figureId: string;
  /** Short title of the figure. */
  title: string;
  /** What the figure means, in one sentence. */
  what: string;
  /** The formula in English and in code, with its location. */
  formula: { english: string; code: string; file: string; line: number };
  /** Inputs to the formula; value is null when it could not be re-executed rather than retyped. */
  inputs: { label: string; value: string | null; source: string }[];
  /** Where each input lives: table and column, file constant or browser storage. */
  data: string[];
  /** Commits that touched the trail's files. */
  build: { sha: string; at: string; author: string; subject: string; file: string }[];
  /** The signature on the figure's screen, or null when unsigned. */
  signoff: Signoff | null;
  /** True when the values come from re-executing the target's own function. */
  reexecuted: boolean;
}
