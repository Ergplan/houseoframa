// What a target tells House of Rama about its screens and figures (docs/HOUSE-STYLE.md):
//  - `.rama/screens.json`: how to build and start the app, and which screens to photograph.
//  - `rama/figures.ts` (the house convention, in the target's code): figureId → {fn, file, line, inputs}.
//  - `.rama/figures.json` (an overlay, for a target not yet following the convention): the same mapping
//    written by hand, plus where each figure sits on its screen and how to re-execute it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const Step = z.union([
  z.object({ click: z.string().min(1) }).strict(),
  z.object({ fill: z.string().min(1), value: z.string() }).strict(),
  z.object({ press: z.string().min(1) }).strict(),
  z.object({ waitFor: z.string().min(1) }).strict(),
  z.object({ wait: z.number().int().min(0).max(10_000) }).strict(),
]);
export type Step = z.infer<typeof Step>;

export const ScreenSpec = z.object({
  /** File-safe name: the screenshot is shots/<name>.png. */
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  title: z.string().min(1).optional(),
  /** Path to open, with its query string if any. */
  route: z.string().startsWith('/'),
  /** Who is looking; the app section's `roles` says how a role is put on. */
  role: z.string().min(1).optional(),
  /**
   * Who the screen is for, in the counting rule (Invariant 11): every count of screens names its
   * audience. Customer when not said.
   */
  audience: z.enum(['customer', 'staff', 'admin']).default('customer'),
  steps: z.array(Step).default([]),
});
export type ScreenSpec = z.infer<typeof ScreenSpec>;

export const ScreensConfig = z.object({
  app: z.object({
    /** Run when node_modules is missing. */
    install: z.string().default('npm ci'),
    build: z.string().default('npm run build'),
    /** `{port}` is replaced with a free port. */
    start: z.string().default('npm start -- -p {port}'),
    /** Directory the start command runs in, relative to the repository. */
    cwd: z.string().default('.'),
    /** A route that answers once the app is up. */
    ready: z.string().startsWith('/').default('/'),
  }),
  viewport: z
    .object({ width: z.number().int().min(200), height: z.number().int().min(200) })
    .default({ width: 390, height: 844 }),
  /** How a role is put on: a query string to append. A role not listed adds nothing. */
  roles: z.record(z.string(), z.object({ query: z.string().optional() })).default({}),
  /**
   * Text that holds a figure: amounts and percentages (an element whose whole text is a number is always
   * a figure too). A figure no traced figure covers is recorded untraced.
   */
  figurePattern: z.string().default('[₹$€£]\\s?\\d[\\d,]*(\\.\\d+)?|\\d+(\\.\\d+)?\\s?%'),
  screens: z.array(ScreenSpec).min(1),
});
export type ScreensConfig = z.infer<typeof ScreensConfig>;

const Input = z.object({
  label: z.string().min(1),
  /** Where the value enters the code: a parameter, a field, a constant. */
  source: z.string().min(1),
  /** Where the value lives: table and column, file constant, fixture file, browser storage. */
  data: z.string().min(1).optional(),
});

/** One entry of the convention's `rama/figures.ts`. */
export const FigureMapping = z.object({
  /** The function that computes the figure. */
  fn: z.string().min(1),
  /** Its file, relative to the repository. */
  file: z.string().min(1),
  /** The line it starts on. */
  line: z.number().int().min(1),
  inputs: z.array(Input).default([]),
  title: z.string().optional(),
  what: z.string().optional(),
  /** The formula in plain English. */
  english: z.string().optional(),
  /** More files whose commits belong to the figure's build trail. */
  files: z.array(z.string()).default([]),
});
export type FigureMapping = z.infer<typeof FigureMapping>;

/** One entry of the `.rama/figures.json` overlay: the mapping plus placement and re-execution. */
export const OverlayFigure = FigureMapping.extend({
  title: z.string().min(1),
  what: z.string().min(1),
  english: z.string().min(1),
  /** The screen (by name), or screens, it appears on, and a CSS selector for the element showing it. */
  screen: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  selector: z.string().min(1),
  /**
   * A module, relative to the repository, whose default export re-executes the target's own function
   * with the screen's inputs and returns `{text, value, inputs: [{label, value}]}`. Without it the trail
   * says the figure was not re-executed.
   */
  run: z.string().min(1).optional(),
});
export type OverlayFigure = z.infer<typeof OverlayFigure>;

export const FiguresOverlay = z.record(
  z.string().regex(/^[a-z0-9][a-z0-9.-]{0,79}$/),
  OverlayFigure,
);
export type FiguresOverlay = z.infer<typeof FiguresOverlay>;

function readJson<T>(repoDir: string, file: string, schema: z.ZodType<T>): T | null {
  const full = path.join(repoDir, file);
  if (!existsSync(full)) return null;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new Error(`${file} does not match its schema: ${parsed.error.message}`);
  return parsed.data;
}

export const SCREENS_FILE = '.rama/screens.json';
export const FIGURES_FILE = '.rama/figures.json';
export const CONVENTION_FILE = 'rama/figures.ts';

export const readScreensConfig = (repoDir: string) =>
  readJson(repoDir, SCREENS_FILE, ScreensConfig);
export const readFiguresOverlay = (repoDir: string) =>
  readJson(repoDir, FIGURES_FILE, FiguresOverlay) ?? {};

/** The screens an overlay figure appears on. */
export const screensOf = (f: OverlayFigure): string[] =>
  Array.isArray(f.screen) ? f.screen : [f.screen];
