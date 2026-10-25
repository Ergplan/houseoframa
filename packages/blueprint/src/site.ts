// Sites. A site is a target repository cloned read-only into work/<site>/repo, with its Blueprint in
// work/<site>/blueprint.json and a record in work/<site>/site.json. The site "self" is this
// repository, with its Blueprint in blueprint/self.json (rule 14).
//
// The only thing House of Rama writes into a target is its reviewed overlay in `.rama/`: a named
// person's confirmation of a drafted phrase or purpose (Invariant 1). Nothing is committed or pushed;
// the site's Blueprint reads the overlay from the working copy and everything else from HEAD.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { z } from 'zod';
import { diffBlueprints, formatDiff } from './diff.ts';
import { extract, type ExtractOptions } from './extract.ts';
import { originName, readWorktree, stripCredentials } from './git.ts';
import { Glossary, mergeGlossary } from './glossary.ts';
import { canonicalJson } from './json.ts';

export const SELF_SITE_ID = 'self';

/** How this repository extracts itself: the working tree, minus the Blueprint files it carries. */
export const SELF_EXTRACT: ExtractOptions = {
  worktree: true,
  exclude: ['blueprint/*.json'],
  repo: 'Ergplan/houseoframa',
};

export const GLOSSARY_FILE = '.rama/glossary.json';
export const PURPOSES_FILE = '.rama/purposes.json';

const SITE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const SiteRecord = z.object({
  id: z.string().regex(SITE_ID),
  name: z.string().min(1),
  /** Where it was cloned from, without credentials. */
  source: z.string().min(1),
  /** Written to Blueprint.repo. */
  repo: z.string().min(1),
  addedAt: z.string().min(1),
  /**
   * A product is built inside House of Rama, in its own repository that House of Rama creates and pushes
   * to (Stage 7); an outside site is only rendered, from a read-only clone. Absent means outside.
   */
  kind: z.enum(['product', 'outside']).optional(),
  /** A product's one-line idea, as its maker said it. */
  idea: z.string().optional(),
  /** A product's repository on GitHub (https, no credentials), once it is created. */
  remote: z.string().optional(),
  /** The commit that laid the house stack down (Stage 9): the merge gate's base while the builder builds. */
  houseStack: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  /** The builder that builds the product (Stage 9 seats), as it was when the build last started. */
  builder: z.string().optional(),
});
export type SiteRecord = z.infer<typeof SiteRecord>;

export interface SiteLocation {
  id: string;
  name: string;
  /** product | outside (self is outside: House of Rama renders itself, it does not build itself here). */
  kind: 'product' | 'outside';
  /** The checkout the Blueprint is extracted from and the overlay is written to. */
  repoDir: string;
  blueprintPath: string;
  options: ExtractOptions;
}

export class SiteError extends Error {
  override name = 'SiteError';
  constructor(
    message: string,
    readonly code: 'not-found' | 'conflict' | 'invalid',
  ) {
    super(message);
  }
}

export const isSiteId = (id: string) => SITE_ID.test(id);

/** This repository's root: RAMA_HOME, else the nearest directory up from cwd that holds packages/blueprint. */
export function houseRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.RAMA_HOME) return path.resolve(env.RAMA_HOME);
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'packages/blueprint/package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('cannot find the House of Rama repository: set RAMA_HOME');
    dir = up;
  }
}

/** Where target sites are cloned: RAMA_WORK_DIR, else work/ in this repository (gitignored). */
export const workDir = (env: NodeJS.ProcessEnv = process.env) =>
  env.RAMA_WORK_DIR ? path.resolve(env.RAMA_WORK_DIR) : path.join(houseRoot(env), 'work');

function selfLocation(env: NodeJS.ProcessEnv): SiteLocation {
  const root = houseRoot(env);
  return {
    id: SELF_SITE_ID,
    name: 'House of Rama',
    kind: 'outside',
    repoDir: root,
    blueprintPath: path.join(root, 'blueprint/self.json'),
    options: SELF_EXTRACT,
  };
}

function readRecord(dir: string): SiteRecord | null {
  const file = path.join(dir, 'site.json');
  if (!existsSync(file)) return null;
  return SiteRecord.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function fromRecord(record: SiteRecord, dir: string): SiteLocation {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind ?? 'outside',
    repoDir: path.join(dir, 'repo'),
    blueprintPath: path.join(dir, 'blueprint.json'),
    // HEAD's code, history and refs; the overlay as it stands in the working copy.
    options: { overlay: 'worktree', repo: record.repo },
  };
}

/** The site with this id, or null. Never throws for an unknown or malformed id. */
export function locateSite(id: string, env: NodeJS.ProcessEnv = process.env): SiteLocation | null {
  if (!isSiteId(id)) return null;
  if (id === SELF_SITE_ID) return selfLocation(env);
  const dir = path.join(workDir(env), id);
  const record = readRecord(dir);
  return record ? fromRecord(record, dir) : null;
}

/** Self first, then every cloned site by id. */
export function listSites(env: NodeJS.ProcessEnv = process.env): SiteLocation[] {
  const root = workDir(env);
  const ids = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && isSiteId(d.name) && d.name !== SELF_SITE_ID)
        .map((d) => d.name)
        .sort()
    : [];
  return [selfLocation(env), ...ids.map((id) => locateSite(id, env)).filter((s): s is SiteLocation => s !== null)];
}

export const extractSite = (site: SiteLocation): Blueprint => extract(site.repoDir, site.options);

export function readSiteBlueprint(site: SiteLocation): Blueprint | null {
  return existsSync(site.blueprintPath) ? (JSON.parse(readFileSync(site.blueprintPath, 'utf8')) as Blueprint) : null;
}

/** Regenerates the site's Blueprint file from its checkout and returns it. */
export function writeSiteBlueprint(site: SiteLocation): Blueprint {
  const bp = extractSite(site);
  mkdirSync(path.dirname(site.blueprintPath), { recursive: true });
  writeFileSync(site.blueprintPath, canonicalJson(bp));
  return bp;
}

/** Whether the site's Blueprint file equals a fresh extraction, with the difference when it does not. */
export function checkSiteBlueprint(site: SiteLocation): { ok: boolean; detail: string } {
  const fresh = canonicalJson(extractSite(site));
  const current = existsSync(site.blueprintPath) ? readFileSync(site.blueprintPath, 'utf8') : '';
  if (current === fresh) return { ok: true, detail: `${site.blueprintPath} is up to date` };
  const diff = current
    ? formatDiff(diffBlueprints(JSON.parse(current) as Blueprint, JSON.parse(fresh) as Blueprint))
    : '(file missing)';
  return { ok: false, detail: `${site.blueprintPath} has drifted from \`rama extract\`:\n${diff}` };
}

/**
 * Clones a repository (URL or local path) into work/<id>/repo and extracts its Blueprint. The id
 * defaults to the source's directory name. Refuses an existing site rather than overwrite it.
 */
export function addSite(
  source: string,
  opts: { id?: string; name?: string; now?: () => Date; env?: NodeJS.ProcessEnv } = {},
): { site: SiteLocation; blueprint: Blueprint } {
  const env = opts.env ?? process.env;
  const local = existsSync(source);
  const from = local ? path.resolve(source) : source;
  const base = path.basename(stripCredentials(from)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const id = opts.id ?? base;
  if (!isSiteId(id)) throw new SiteError(`"${id}" is not a site id: lowercase letters, digits and dashes`, 'invalid');
  if (id === SELF_SITE_ID) throw new SiteError('"self" is this repository and cannot be added', 'invalid');
  const dir = path.join(workDir(env), id);
  if (existsSync(dir)) throw new SiteError(`site "${id}" already exists in ${dir}`, 'conflict');

  mkdirSync(dir, { recursive: true });
  try {
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', from, path.join(dir, 'repo')], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const record: SiteRecord = {
      id,
      name: opts.name ?? base,
      source: local ? from : stripCredentials(from),
      repo: (local ? originName(from) : null) ?? (local ? path.basename(from) : stripCredentials(from)),
      addedAt: (opts.now ?? (() => new Date()))().toISOString(),
    };
    writeFileSync(path.join(dir, 'site.json'), canonicalJson(record));
    const site = fromRecord(record, dir);
    return { site, blueprint: writeSiteBlueprint(site) };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/** The site's record (site.json), or null for "self" and an unknown site. */
export function siteRecord(id: string, env: NodeJS.ProcessEnv = process.env): SiteRecord | null {
  if (!isSiteId(id) || id === SELF_SITE_ID) return null;
  return readRecord(path.join(workDir(env), id));
}

/** Changes a site's record (a product's remote, once its repository exists). */
export function updateSiteRecord(
  id: string,
  patch: Partial<Pick<SiteRecord, 'remote' | 'name' | 'idea' | 'houseStack' | 'builder'>>,
  env: NodeJS.ProcessEnv = process.env,
): SiteRecord {
  const dir = path.join(workDir(env), id);
  const current = readRecord(dir);
  if (!current) throw new SiteError(`no site "${id}"`, 'not-found');
  const next = SiteRecord.parse({ ...current, ...patch });
  writeFileSync(path.join(dir, 'site.json'), canonicalJson(next));
  return next;
}

/**
 * Creates a product's site: work/<id>/repo is a new git repository that `init` fills and commits, and
 * site.json records it as a product. Refuses an existing id rather than overwrite it.
 */
export function createProductSite(
  input: { id: string; name: string; idea: string; now?: () => Date; env?: NodeJS.ProcessEnv },
  init: (repoDir: string) => void,
): SiteLocation {
  const env = input.env ?? process.env;
  if (!isSiteId(input.id)) throw new SiteError(`"${input.id}" is not a site id: lowercase letters, digits and dashes`, 'invalid');
  if (input.id === SELF_SITE_ID) throw new SiteError('"self" is this repository', 'invalid');
  const dir = path.join(workDir(env), input.id);
  if (existsSync(dir)) throw new SiteError(`site "${input.id}" already exists`, 'conflict');
  mkdirSync(path.join(dir, 'repo'), { recursive: true });
  try {
    init(path.join(dir, 'repo'));
    const record: SiteRecord = {
      id: input.id,
      name: input.name,
      source: 'House of Rama',
      repo: input.id,
      addedAt: (input.now ?? (() => new Date()))().toISOString(),
      kind: 'product',
      idea: input.idea,
    };
    writeFileSync(path.join(dir, 'site.json'), canonicalJson(record));
    return fromRecord(record, dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/** Reads one overlay file from the site's working copy ({} when absent). */
export function readSiteOverlay(site: SiteLocation, file: string): Glossary {
  const full = path.join(site.repoDir, file);
  return existsSync(full) ? Glossary.parse(JSON.parse(readFileSync(full, 'utf8'))) : {};
}

export function writeSiteOverlay(site: SiteLocation, file: string, value: Glossary): void {
  const full = path.join(site.repoDir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, canonicalJson(value));
}

/** The overlay file's exact bytes (null when absent), to put back if a confirmation cannot be recorded. */
export function snapshotOverlay(site: SiteLocation, file: string): string | null {
  const full = path.join(site.repoDir, file);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

/** Puts an overlay file back as it was and regenerates the site's Blueprint. */
export function restoreOverlay(site: SiteLocation, file: string, snapshot: string | null): Blueprint {
  const full = path.join(site.repoDir, file);
  if (snapshot === null) rmSync(full, { force: true });
  else writeFileSync(full, snapshot);
  return writeSiteBlueprint(site);
}

/** The text bricks of the site's checkout as they stand on disk, for drafting. */
export function siteReader(site: SiteLocation): (p: string) => string | null {
  const texts = new Map(readWorktree(site.repoDir, site.options.exclude ?? []).map((f) => [f.path, f.content.toString('utf8')]));
  return (p) => texts.get(p) ?? null;
}

export interface Confirmation {
  /** Overlay keys that this call confirmed. */
  confirmed: string[];
  /** Symbols on the edge with no phrase at all: nothing to confirm, so the edge stays unconfirmed. */
  missing: string[];
  blueprint: Blueprint;
}

/**
 * The local member confirms the English of one dependency edge, as shown to them (`shown` must equal
 * the edge's current text, so a phrase redrafted in between is never confirmed unseen). Each symbol's
 * phrase is written back path-qualified (`<to>#<symbol>`) with the confirmer and the time, so the
 * confirmation covers exactly the edge's source file and no other file that exports the same name.
 */
export function confirmEdge(
  site: SiteLocation,
  edge: { from: string; to: string; shown: string },
  person: string,
  at: Date,
): Confirmation {
  if (!person.trim()) throw new SiteError('no member name: set RAMA_MEMBER_NAME', 'invalid');
  const current = readSiteBlueprint(site) ?? writeSiteBlueprint(site);
  const found = current.edges.find((e) => e.from === edge.from && e.to === edge.to);
  if (!found) throw new SiteError(`no dependency ${edge.from} → ${edge.to} in site "${site.id}"`, 'not-found');
  if (!found.english) throw new SiteError(`${edge.from} → ${edge.to} has no phrase to confirm`, 'invalid');
  // What is confirmed must be exactly what was shown: the Blueprint the member read, and the overlay as it
  // stands now (it may have been redrafted without the Blueprint being regenerated).
  const glossary = readSiteOverlay(site, GLOSSARY_FILE);
  const now = mergeGlossary([{ ...found, english: undefined }], glossary)[0]!.english?.text;
  if (found.english.text !== edge.shown || now !== edge.shown) {
    throw new SiteError('the phrase has changed since it was shown; reload and read it again', 'conflict');
  }

  const confirmed: string[] = [];
  const missing: string[] = [];
  for (const symbol of found.symbols) {
    const qualified = `${edge.to}#${symbol}`;
    const bare = symbol === 'default' || symbol === '*' ? undefined : glossary[symbol];
    const entry = glossary[qualified] ?? bare;
    if (!entry) {
      missing.push(symbol);
      continue;
    }
    if (entry.confirmedBy && entry.confirmedAt) continue; // already confirmed by a named person
    glossary[qualified] = { text: entry.text, confirmedBy: person, confirmedAt: at.toISOString() };
    confirmed.push(qualified);
  }
  if (confirmed.length) writeSiteOverlay(site, GLOSSARY_FILE, glossary);
  return { confirmed, missing, blueprint: confirmed.length ? writeSiteBlueprint(site) : current };
}

/** The local member confirms a brick's drafted purpose, as shown to them. */
export function confirmPurpose(
  site: SiteLocation,
  brick: { path: string; shown: string },
  person: string,
  at: Date,
): Confirmation {
  if (!person.trim()) throw new SiteError('no member name: set RAMA_MEMBER_NAME', 'invalid');
  const purposes = readSiteOverlay(site, PURPOSES_FILE);
  const entry = purposes[brick.path];
  if (!entry) throw new SiteError(`${brick.path} has no purpose to confirm`, 'not-found');
  if (entry.text !== brick.shown) {
    throw new SiteError('the purpose has changed since it was shown; reload and read it again', 'conflict');
  }
  if (entry.confirmedBy && entry.confirmedAt) {
    return { confirmed: [], missing: [], blueprint: readSiteBlueprint(site) ?? writeSiteBlueprint(site) };
  }
  purposes[brick.path] = { text: entry.text, confirmedBy: person, confirmedAt: at.toISOString() };
  writeSiteOverlay(site, PURPOSES_FILE, purposes);
  return { confirmed: [brick.path], missing: [], blueprint: writeSiteBlueprint(site) };
}
