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
  /** True when the file also reads an environment variable whose name the extractor could not resolve. */
  envDynamic: boolean;
  /** SHA of the oldest commit in the extracted history that touched the file; empty when none did (a pending file). */
  firstCommit: string;
  /** SHA of the most recent commit in the extracted history that touched the file; empty when none did. */
  lastCommit: string;
  /** Number of commits that changed the file. */
  changes: number;
  /** Outside packages the file imports at run time, by package name; absent when it imports none. */
  packages?: string[];
  /** Hosts of the web addresses written in the file's strings; absent when none. */
  hosts?: string[];
  /** Tables the file uses through a runtime import of the file that defines them (writes: passed to insert, update or delete); absent when none. */
  tables?: { name: string; reads: boolean; writes: boolean }[];
  /** What the brick is for, in English: from the `.rama/` overlay when confirmed, otherwise an unconfirmed draft. */
  purpose?: { text: string; confirmed: boolean; by?: string; at?: string };
}

/** A resolved internal import from one brick to another. */
export interface ImportEdge {
  /** Path of the importing brick. */
  from: string;
  /** Path of the imported brick. */
  to: string;
  /** Symbols imported across the edge: names, `default`, or `*` for a namespace, re-export-all or dynamic import; empty for a side-effect import. */
  symbols: string[];
  /** True when every import across the edge is type-only, so it carries no runtime dependency. */
  typeOnly: boolean;
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
  /** Per-file changes: kind (Added, Modified, Deleted, Renamed), line counts (null for binary files), and the old path of a rename. */
  changes: {
    path: string;
    kind: 'A' | 'M' | 'D' | 'R';
    add: number | null;
    del: number | null;
    from?: string;
  }[];
}

/** A database table the target defines in code (Drizzle `pgTable`, `sqliteTable` or `mysqlTable`). */
export interface Table {
  /** The table's name in the database. */
  name: string;
  /** The brick that defines it. */
  file: string;
  /** Line of the definition. */
  line: number;
  /** The exported name that holds it. */
  symbol: string;
  /** The columns as the definition names them, in source order. */
  columns: string[];
  /** Every column as its definition writes it, spread columns of the same file included (Stage 11); absent in older extractions. */
  fields?: TableField[];
  /** Spreads in the definition whose columns could not be read (defined in another file); absent when none. */
  unread?: string[];
}

/** A column of a table as its Drizzle definition writes it, read from the syntax: nothing it does not say. */
export interface TableField {
  /** The key in the definition's columns object. */
  key: string;
  /** Its name in the database. */
  name: string;
  /** The Drizzle builder that makes it (`serial`, `integer`, `text`, `timestamp`, …); `unknown` when unread. */
  type: string;
  /** True for the primary key. */
  primary: boolean;
  /** True when it may not be empty. */
  notNull: boolean;
  /** True when no two rows may hold the same value. */
  unique: boolean;
  /** The column it points at (`sites.site_id`), as resolved, else as written; absent when none. */
  references?: string;
  /** True when the definition marks it secret (`@secret` in its comment): its values are masked. */
  secret: boolean;
  /** The spread it came from (`provenance`), when not written in the columns object itself. */
  from?: string;
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
  /** The figure's text as the screen showed it, when it was read from the page. */
  text?: string;
}

/** The generated, machine-maintained model of a repository at one commit. */
export interface Blueprint {
  /** Repository identifier (URL or path) the Blueprint was extracted from. */
  repo: string;
  /** SHA of the commit extracted; with `worktree`, the commit the working tree sits on. Empty when there is no history. */
  commit: string;
  /** True when files were read from a working tree with changes pending on top of `commit` (how this repository renders itself). */
  worktree: boolean;
  /** Committer date of `commit`, ISO 8601: deterministic, so re-extracting the same commit is byte-identical. */
  extractedAt: string;
  /** Version of the extractor that wrote the Blueprint. */
  extractorVersion: string;
  /** The floors, bottom to top. */
  layers: { id: Layer; label: string }[];
  /** One brick per tracked file. */
  nodes: BrickNode[];
  /** Resolved internal imports. */
  edges: ImportEdge[];
  /** Relative or aliased imports that point inside the repository but match no tracked file. */
  unresolved: { from: string; spec: string }[];
  /** External dependencies with their declared versions, the manifest declaring them, and whether they are dev-only. */
  external: { name: string; version: string; dev: boolean; manifest: string }[];
  /** Full history, oldest first. */
  commits: Commit[];
  /** Branch names (local and remote, deduplicated); empty in a worktree extraction, where refs depend on the machine. */
  branches: string[];
  /** Tag names; empty in a worktree extraction. */
  tags: string[];
  /** Screens discovered from the app's routes. */
  screens: Screen[];
  /** Tables defined in code, by file then name. */
  tables: Table[];
}
