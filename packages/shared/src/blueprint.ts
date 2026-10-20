/** A floor of the building. The house-stack defaults are listed; a target may define its own in `.rama/layers.json`. */
export type Layer = 'foundation' | 'data' | 'logic' | 'api' | 'interface' | 'shell' | string;

/** One tracked file of the target repository, drawn as a brick. */
export interface BrickNode {
  /** Path relative to the repository root, forward slashes. */
  path: string;
  /** The floor this brick sits on. */
  layer: Layer;
  /** The rule that assigned the layer: an overlay rule from `.rama/layers.json` or a house-stack default. */
  layerRule: string;
  /** Text lines in the file; 0 for binary files. */
  lines: number;
  /** Size of the file in bytes. */
  bytes: number;
  /** True when the file is not text. */
  binary: boolean;
  /** True when the file is a test file. */
  test: boolean;
  /** Names the file exports. */
  exports: string[];
  /** Environment variable names the file reads. */
  env: string[];
  /** SHA of the commit that added the file. */
  firstCommit: string;
  /** SHA of the most recent commit that changed the file. */
  lastCommit: string;
  /** Number of commits that changed the file. */
  changes: number;
  /** What the brick is for, in English: from the `.rama/` overlay when confirmed, otherwise an unconfirmed draft. */
  purpose?: { text: string; confirmed: boolean; by?: string; at?: string };
}

/** A resolved internal import from one brick to another. */
export interface ImportEdge {
  /** Path of the importing brick. */
  from: string;
  /** Path of the imported brick. */
  to: string;
  /** Symbols imported across the edge. */
  symbols: string[];
  /** The dependency in English, from `.rama/glossary.json`; unconfirmed until a named person confirms it. */
  english?: { text: string; confirmed: boolean; by?: string; at?: string };
}

/** One commit of the target's history. */
export interface Commit {
  /** Full commit SHA. */
  sha: string;
  /** Abbreviated SHA as git prints it. */
  short: string;
  /** Commit timestamp, ISO 8601. */
  at: string;
  /** Author name. */
  author: string;
  /** First line of the commit message. */
  subject: string;
  /** Per-file changes: kind (Added, Modified, Deleted, Renamed) and line counts, null for binary files. */
  changes: { path: string; kind: 'A' | 'M' | 'D' | 'R'; add: number | null; del: number | null }[];
}

/** A screen of the target's app: a route and the bricks that render it. */
export interface Screen {
  /** Stable screen identifier. */
  id: string;
  /** Human name of the screen. */
  name: string;
  /** Route path pattern, e.g. `/bills/[id]`. */
  route: string;
  /** The file that defines the route. */
  file: string;
  /** Paths of the bricks that render the screen (the route's import closure). */
  bricks: string[];
  /** Path to the captured screenshot, when one exists. */
  shot?: string;
  /** Figures found on the captured screen. */
  figures?: FigureRef[];
}

/** A figure located on a captured screen. */
export interface FigureRef {
  /** Figure identifier (`data-rama-figure`). */
  id: string;
  /** Bounding box on the screenshot, in pixels. */
  box: { x: number; y: number; w: number; h: number };
  /** True when a trail exists for the figure; false renders it in the untraced state. */
  traced: boolean;
}

/** The generated, machine-maintained model of a repository at one commit. */
export interface Blueprint {
  /** Repository identifier (URL or path) the Blueprint was extracted from. */
  repo: string;
  /** SHA of the commit extracted. */
  commit: string;
  /** Time of extraction, ISO 8601. */
  extractedAt: string;
  /** Version of the extractor that wrote the Blueprint. */
  extractorVersion: string;
  /** The floors, bottom to top. */
  layers: { id: Layer; label: string }[];
  /** One brick per tracked file. */
  nodes: BrickNode[];
  /** Resolved internal imports. */
  edges: ImportEdge[];
  /** External dependencies with their declared versions. */
  external: { name: string; version: string }[];
  /** Full history, oldest first. */
  commits: Commit[];
  /** Branch names. */
  branches: string[];
  /** Tag names. */
  tags: string[];
  /** Screens discovered from the app's routes. */
  screens: Screen[];
}
