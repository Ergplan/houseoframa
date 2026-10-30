// The film (Stage 13): a product's build as a non-coder watches it, assembled from what House of Rama
// already records and nothing else. The plan is the decided cards; the design is the product's Street
// (its buildings, their four floors, the tables in the ground, the services across the water); the
// foundation is the house-stack commit, one frame per file; each lift is a commit with the builder's
// own words (the answer it gave for that lift, kept by the build loop), the files it wrote in the order
// it wrote them (the edit tail), the tables those files read or write, and whether the checks let it
// through. No model is called here and nothing is invented: a lift with no recorded words says what
// changed from its commit subject and says so (rule 12). House of Rama stands outside the product: the
// film is what it saw, kept apart from the product's own code.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Blueprint } from '@rama/shared';
import { DECISIONS_FILE, DecisionRecord, parseLines } from '@rama/ceremony/records';
import { workDir, type SiteLocation } from '@rama/blueprint/site';
import { foundationFrames, layerOfPath, type FoundationFrame, type Layer } from './foundation.ts';
import { readEdits, type EditEvent } from './tail.ts';
import type { Job } from './jobs.ts';

export const FILM_COMPONENT = 'rama:workbench-film@0.1.0';
/** The subject the build loop gives the house-stack commit. */
const HOUSE_STACK = 'Start from the house stack';
/** A file the film types in: longer files are shown in part, and say so. */
export const MAX_TYPED_LINES = 400;

export interface PlanStep {
  n: number;
  title: string;
  statement: string;
  /** Who said yes, and when; null while the card is open. */
  decided: { by: string; at: string } | null;
}

export interface DesignBuilding {
  id: string;
  name: string;
  does: string | null;
  screens: string[];
  tables: { name: string; reads: boolean; writes: boolean }[];
  services: string[];
}

export interface DesignTable {
  name: string;
  columns: { name: string; type: string; key: string; from?: string }[];
  /** Buildings that write it, and that only read it. */
  writers: string[];
  readers: string[];
  /** The files that write it and read it, for the matrix of who may change what. */
  writeFiles: string[];
  readFiles: string[];
}

export interface FilmFile {
  path: string;
  /** The building the file stands in on the Street, or null for a file the Street does not draw. */
  building: string | null;
  layer: Layer;
  status: 'added' | 'changed' | 'deleted';
  /** The file after the lift (cut at MAX_TYPED_LINES), and which of its lines are new (1-based). */
  text: string;
  added: number[];
  removed: number;
  /** True when the file is longer than what is typed. */
  cut: boolean;
  /** When in the lift the builder saved it, in ms from the lift's start, from the edit tail. */
  at: number | null;
  /** The tables this file reads or writes, from the Blueprint. */
  tables: { name: string; reads: boolean; writes: boolean }[];
}

export interface FilmLift {
  n: number;
  commit: string;
  subject: string;
  at: string;
  /** The builder's own words for this lift; `source` says where they were kept. */
  said: { text: string; source: 'builder' | 'commit' } | null;
  /** What the builder said it would do next. */
  next: string | null;
  /** The checks after the lift: passed, or a grey flag with its sentence and the next action. */
  checked: { ok: boolean; sentence: string; next: string | null } | null;
  files: FilmFile[];
  /** Tables that lit up in this lift: written for the first time, or first read. */
  tablesLit: string[];
}

export interface Film {
  site: { id: string; name: string; idea: string | null };
  builder: string | null;
  steps: PlanStep[];
  design: { buildings: DesignBuilding[]; tables: DesignTable[]; services: string[] };
  foundation: { commit: string; at: string; frames: FoundationFrame[] } | null;
  lifts: FilmLift[];
  /** "planning" before a lift exists; "building" while the build job runs; "built" after. */
  status: 'planning' | 'building' | 'built';
  /** The build job's last sentence, for a film still being made or stopped. */
  last: { ok: boolean | null; sentence: string; next: string | null } | null;
}

export interface FilmInput {
  site: SiteLocation;
  name: string;
  idea: string | null;
  builder: string | null;
  blueprint: Blueprint | null;
  /** The Street's buildings (packages/stage resolveFeatures + street), id → files. */
  buildings: DesignBuilding[];
  buildingOf: (path: string) => string | null;
  env?: NodeJS.ProcessEnv;
}

const git = (repoDir: string, args: string[]) =>
  execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();

/** The decided cards in the order they were first written: the plan, read aloud. */
export function planSteps(repoDir: string): PlanStep[] {
  const f = path.join(repoDir, DECISIONS_FILE);
  if (!existsSync(f)) return [];
  const all = parseLines(readFileSync(f, 'utf8'), DecisionRecord, DECISIONS_FILE);
  const superseded = new Set(all.map((d) => d.supersedes).filter(Boolean));
  const firstOf = new Map<string, string>();
  for (const d of all) firstOf.set(d.id, d.supersedes ? (firstOf.get(d.supersedes) ?? d.id) : d.id);
  const order = all.filter((d) => !d.supersedes).map((d) => d.id);
  return all
    .filter((d) => !superseded.has(d.id) && d.status !== 'withdrawn')
    .sort((a, b) => order.indexOf(firstOf.get(a.id)!) - order.indexOf(firstOf.get(b.id)!))
    .map((d, i) => ({
      n: i + 1,
      title: d.title,
      statement: d.statement,
      decided: d.status === 'decided' ? { by: d.by, at: d.at } : null,
    }));
}

/** The tables of the ground, with who writes and who only reads each one. */
export function designTables(
  bp: Blueprint,
  buildingOf: (p: string) => string | null,
): DesignTable[] {
  const tables = (bp as Blueprint & { tables?: TableLike[] }).tables ?? [];
  return tables.map((t) => {
    const touching = bp.nodes.filter((n) => !n.test && n.tables?.some((x) => x.name === t.name));
    const w = touching.filter((n) => n.tables!.some((x) => x.name === t.name && x.writes));
    const r = touching.filter((n) =>
      n.tables!.some((x) => x.name === t.name && x.reads && !x.writes),
    );
    const names = (ns: typeof touching) => [
      ...new Set(ns.map((n) => buildingOf(n.path)).filter((b): b is string => Boolean(b))),
    ];
    const writers = names(w);
    return {
      name: t.name,
      columns: (t.fields ?? []).map((f) => ({
        name: f.name,
        type: f.type,
        key: f.key,
        from: f.from,
      })),
      writers,
      readers: names(r).filter((b) => !writers.includes(b)),
      writeFiles: w.map((n) => n.path),
      readFiles: r.map((n) => n.path),
    };
  });
}
interface TableLike {
  name: string;
  fields?: { name: string; type: string; key: string; from?: string }[];
}

/** The commits of the product, oldest first. */
function commits(repoDir: string): { sha: string; subject: string; at: string }[] {
  try {
    const out = git(repoDir, ['log', '--reverse', '--format=%H%x1f%s%x1f%aI']);
    return out
      ? out.split('\n').map((l) => {
          const [sha, subject, at] = l.split('\x1f') as [string, string, string];
          return { sha, subject, at };
        })
      : [];
  } catch {
    return [];
  }
}

/** The files a commit touched, with the lines it added (numbers in the new file) and removed. */
function commitFiles(
  repoDir: string,
  sha: string,
): { path: string; status: FilmFile['status']; added: number[]; removed: number }[] {
  let raw: string;
  try {
    raw = git(repoDir, ['show', '--format=', '--unified=0', '--no-renames', '--no-color', sha]);
  } catch {
    return [];
  }
  const out: ReturnType<typeof commitFiles> = [];
  let cur: (typeof out)[number] | null = null;
  for (const line of raw.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^diff --git a\/(.+) b\/(.+)$/.exec(line))) {
      cur = { path: m[2]!, status: 'changed', added: [], removed: 0 };
      out.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith('new file mode')) cur.status = 'added';
    else if (line.startsWith('deleted file mode')) cur.status = 'deleted';
    else if (line.startsWith('Binary files')) cur.added = [];
    else if ((m = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line))) {
      const removed = m[1] === undefined ? 1 : Number(m[1]);
      const start = Number(m[2]);
      const count = m[3] === undefined ? 1 : Number(m[3]);
      cur.removed += removed;
      for (let i = 0; i < count; i++) cur.added.push(start + i);
    }
  }
  return out;
}

function fileAt(repoDir: string, sha: string, p: string): string {
  try {
    return git(repoDir, ['show', `${sha}:${p}`]);
  } catch {
    return '';
  }
}

/** The build's job: the build job of the site, or the Test drive that made it. */
export function filmJob(siteId: string, env: NodeJS.ProcessEnv = process.env): Job | null {
  const dir = path.join(workDir(env), '.jobs');
  if (!existsSync(dir)) return null;
  const jobs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Job)
    .filter(
      (j) =>
        (j.kind === 'build' && j.siteId === siteId) ||
        (j.kind === 'testdrive' && j.about === siteId),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return jobs[0] ?? null;
}

/** A lift's own record, as the build loop keeps it (work/<site>/lifts.jsonl). */
export interface LiftRecord {
  n: number;
  commit: string;
  subject: string;
  said: string;
  next: string | null;
  ok: boolean;
  problems: string[];
  at: string;
}

export const liftsFile = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId, 'lifts.jsonl');

export function readLiftRecords(
  siteId: string,
  env: NodeJS.ProcessEnv = process.env,
): LiftRecord[] {
  const f = liftsFile(siteId, env);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as LiftRecord];
      } catch {
        return [];
      }
    });
}

/**
 * The builder's words for a lift from the job's step, for a build made before lifts.jsonl was kept: the
 * step's sentence is “subject”: <the builder's words> <the checks' sentence>; the checks' sentence is cut
 * off where it starts. A flagged step's sentence is the checks' own and gives no words.
 */
export function saidFromStep(sentence: string, subject: string): string | null {
  const head = `“${subject}”: `;
  if (!sentence.startsWith(head)) return null;
  const rest = sentence.slice(head.length);
  const cut = rest.search(/ \d+ screens?; \d+ of \d+ figures? traced/);
  const said = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
  return said || null;
}

/** Assembles the film of a product from its repository, its build records and its Blueprint. */
export function filmOf(input: FilmInput): Film {
  const env = input.env ?? process.env;
  const { site } = input;
  const all = commits(site.repoDir);
  const houseIdx = all.findIndex((c) => c.subject === HOUSE_STACK);
  const house = houseIdx >= 0 ? all[houseIdx]! : null;
  const job = filmJob(site.id, env);
  const records = readLiftRecords(site.id, env);
  const edits = readEdits(site.id, 0, env);
  const bp = input.blueprint;
  const tablesOf = (p: string) => bp?.nodes.find((n) => n.path === p)?.tables ?? [];

  const foundation = house
    ? {
        commit: house.sha,
        at: house.at,
        frames: foundationFrames(
          commitFiles(site.repoDir, house.sha)
            .filter((f) => f.status !== 'deleted')
            .map((f) => ({ path: f.path, lines: f.added.length })),
        ),
      }
    : null;

  const seen = new Set<string>();
  const after = houseIdx >= 0 ? all.slice(houseIdx + 1) : all;
  const steps = job?.steps ?? [];
  const lifts: FilmLift[] = after.map((c, i) => {
    const n = i + 1;
    const rec = records.find((r) => r.commit === c.sha) ?? null;
    // The job's step for this commit: the lift whose sentence quotes its subject.
    const step = steps.find(
      (s) => /^Lift \d+$/.test(s.name) && s.sentence.startsWith(`“${c.subject}”`),
    );
    const words = rec?.said ?? (step && step.ok ? saidFromStep(step.sentence, c.subject) : null);
    const liftEdits = edits.filter((e: EditEvent) => e.lift === n);
    const files = commitFiles(site.repoDir, c.sha).map((f) => {
      const full = f.status === 'deleted' ? '' : fileAt(site.repoDir, c.sha, f.path);
      const lines = full.split('\n');
      const cut = lines.length > MAX_TYPED_LINES;
      const firstEdit = liftEdits.find((e) => e.path === f.path);
      return {
        path: f.path,
        building: input.buildingOf(f.path),
        layer: layerOfPath(f.path),
        status: f.status,
        text: cut ? lines.slice(0, MAX_TYPED_LINES).join('\n') : full,
        added: f.added.filter((l) => l <= MAX_TYPED_LINES),
        removed: f.removed,
        cut,
        at: firstEdit ? firstEdit.at : null,
        tables: tablesOf(f.path),
      };
    });
    // In the order the builder saved them; files the tail did not see keep the commit's order, after.
    files.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
    const tablesLit: string[] = [];
    for (const f of files)
      for (const t of f.tables)
        if (!seen.has(t.name)) {
          seen.add(t.name);
          tablesLit.push(t.name);
        }
    const checked = rec
      ? {
          ok: rec.ok,
          sentence: rec.ok ? 'The checks passed.' : rec.problems.join(' '),
          next: rec.ok ? null : 'The builder fixes this in the next lift.',
        }
      : step
        ? { ok: step.ok === true, sentence: step.sentence, next: step.next ?? null }
        : null;
    return {
      n,
      commit: c.sha,
      subject: c.subject,
      at: c.at,
      said: words
        ? { text: words, source: 'builder' as const }
        : { text: c.subject, source: 'commit' as const },
      next: rec?.next ?? null,
      checked,
      files,
      tablesLit,
    };
  });

  const lastStep = steps.at(-1);
  return {
    site: { id: site.id, name: input.name, idea: input.idea },
    builder: input.builder,
    steps: planSteps(site.repoDir),
    design: {
      buildings: input.buildings,
      tables: bp ? designTables(bp, input.buildingOf) : [],
      services: [...new Set(input.buildings.flatMap((b) => b.services))],
    },
    foundation,
    lifts,
    status: job && job.finishedAt === null ? 'building' : lifts.length ? 'built' : 'planning',
    last: lastStep
      ? { ok: lastStep.ok, sentence: lastStep.sentence, next: lastStep.next ?? null }
      : null,
  };
}

/** The film of a site as the app shows it, with the Street it is drawn on. */
export function siteFilm(
  site: SiteLocation,
  bp: Blueprint | null,
  record: { name: string; idea: string | null; builder: string | null },
  lakefront: { street: { buildings: StreetBuildingLike[] } } | null,
  env: NodeJS.ProcessEnv = process.env,
): Film {
  const buildings: DesignBuilding[] = (lakefront?.street.buildings ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    does: b.does,
    screens: b.screens,
    tables: b.tables,
    services: b.services,
  }));
  const owner = new Map(
    (lakefront?.street.buildings ?? []).flatMap((b) => b.bricks.map((p) => [p, b.id] as const)),
  );
  return filmOf({
    site,
    name: record.name,
    idea: record.idea,
    builder: record.builder,
    blueprint: bp,
    buildings,
    buildingOf: (p) => owner.get(p) ?? null,
    env,
  });
}
interface StreetBuildingLike {
  id: string;
  name: string;
  does: string | null;
  screens: string[];
  bricks: string[];
  tables: { name: string; reads: boolean; writes: boolean }[];
  services: string[];
}
