// Types for make-sample.mjs, for the TypeScript scripts that use it (record-explanations.ts).
export const SAMPLE_BUILD: string;
/** The patches in order: the house stack's lift (0000-), then each of the builder's lifts. */
export function sampleLifts(): string[];
/** Builds the sample product as a git repository at `target`, which must not exist yet. */
export function makeSample(target: string): void;
