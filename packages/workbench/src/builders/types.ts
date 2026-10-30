// A builder is an agent driver (Stage 9, seats): it makes one lift in the product's folder when asked,
// ending in one commit, and answers in plain words what it did and what is next. House of Rama, not the
// builder, then checks the lift. Claude Code is wired; Codex, Gemini CLI and Antigravity are stubs that
// say so; the recorded builder replays lifts a real builder made, for Test drive without a key.
import { z } from 'zod';

export const BUILDER_IDS = [
  'claude-code',
  'codex',
  'gemini-cli',
  'antigravity',
  'recorded',
] as const;
export type BuilderId = (typeof BUILDER_IDS)[number];

/** The builder's answer at the end of a lift (prompts/build.v1.md). */
export const LiftAnswer = z.object({
  said: z.string().min(1).max(600),
  next: z.string().max(600).nullable(),
  done: z.boolean(),
});
export type LiftAnswer = z.infer<typeof LiftAnswer>;

/** What the builder is told for one lift: the brief, the lifts so far, and what to do now. */
export interface LiftInput {
  product: { name: string; idea: string };
  cards: { title: string; statement: string; by: string }[];
  lifts: { n: number; subject: string; ok: boolean; problems: string[] }[];
  ask: 'next' | 'fix';
  problems: string[];
  notYet: string[];
}

export interface LiftRequest {
  repoDir: string;
  siteId: string;
  input: LiftInput;
  /** The conversation to continue, from the builder's last lift; null on the first. */
  session: string | null;
  /** Person id or `rama:<component>@<version>` the run is recorded as made for. */
  createdBy: string;
  /** Each thing the builder says or does while it works (Stage 13), for the film; not a record. */
  onEvent?: (e: BuilderEvent) => void;
}

/** One moment of the builder's work: its own words, or a tool it used and on what. */
export type BuilderEvent =
  | { kind: 'said'; text: string }
  | { kind: 'tool'; tool: string; target: string | null }
  | { kind: 'result'; ok: boolean; text: string };

export interface LiftResult {
  answer: LiftAnswer;
  session: string | null;
  /** The model_calls row, when a model was called. */
  callId: string | null;
  costUsd: number | null;
}

export interface BuilderDriver {
  id: BuilderId;
  /** The builder's name as a person reads it. */
  label: string;
  /** False for a stub: it says why instead of building. */
  wired: boolean;
  /** Makes one lift. A driver that cannot run throws BuilderNotWired with its sentence. */
  lift(req: LiftRequest): Promise<LiftResult>;
}

/** A builder that is not wired yet, or cannot run here: its sentence is shown as it is. */
export class BuilderNotWired extends Error {
  override name = 'BuilderNotWired';
}
