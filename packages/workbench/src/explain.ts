// Plain English beside every block of code (Stage 11). The drafter seat writes one or two sentences per
// block (prompt explain.v1), from the block, the names it imports and its figure mapping only, and the
// sentence is kept by the block's hash in work/<site>/explain/, so a block is never explained twice. A
// drafted sentence is unconfirmed (Invariant 6) until a named person confirms it in the pane; then it is
// written to the product's .rama/explanations.json (an overlay, Invariant 1), with the confirmation in
// audit_log. With no drafter key nothing is drafted and the pane says "Not explained yet".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { workDir, type SiteLocation } from '@rama/blueprint/site';
import { auditLog, homeDir, type Db, type Member } from '@rama/db';
import { call } from '@rama/model';
import { splitBlocks, type Block } from './blocks.ts';

export const EXPLAIN_COMPONENT = 'rama:workbench-explain@0.1.0';
export const EXPLANATIONS_FILE = '.rama/explanations.json';

/** A figure a block serves, as rama/figures.ts names it. */
export interface BlockFigure {
  id: string;
  title: string;
  what: string;
}

export interface Drafted {
  hash: string;
  path: string;
  kind: Block['kind'];
  name: string | null;
  sentence: string;
  /** The figure the sentence names, in the customer's words, when the block serves one. */
  figure: string | null;
  vendor: string;
  model: string;
  callId: string;
  at: string;
  /** The commit the block was drafted at (the lift's): replay shows it from there on, not before. */
  commit: string | null;
  /** In a recording: the lift it was drafted after (0 for the house stack's own lift). */
  lift?: number;
}

export interface Confirmed {
  hash: string;
  path: string;
  name: string | null;
  sentence: string;
  by: string;
  at: string;
  /** The commit the block stood at when it was confirmed. */
  commit: string | null;
}

/** What the pane shows beside a block. */
export type Explanation =
  | { state: 'confirmed'; sentence: string; figure: string | null; by: string; at: string }
  | { state: 'unconfirmed'; sentence: string; figure: string | null; drafter: string }
  | { state: 'none' };

const cacheDir = (siteId: string, env: NodeJS.ProcessEnv) =>
  path.join(workDir(env), siteId, 'explain');
const cacheFile = (siteId: string, hash: string, env: NodeJS.ProcessEnv) =>
  path.join(cacheDir(siteId, env), `${hash}.json`);

export function drafted(
  siteId: string,
  hash: string,
  env: NodeJS.ProcessEnv = process.env,
): Drafted | null {
  const f = cacheFile(siteId, hash, env);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Drafted) : null;
}

/** The confirmed sentences in a product's overlay: as it is now, or as it stood at a commit. */
export function confirmedIn(repoDir: string, commit?: string): Confirmed[] {
  let text: string | null;
  if (commit) {
    try {
      text = execFileSync('git', ['-C', repoDir, 'show', `${commit}:${EXPLANATIONS_FILE}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      text = null; // not there at that commit
    }
  } else {
    const f = path.join(repoDir, EXPLANATIONS_FILE);
    text = existsSync(f) ? readFileSync(f, 'utf8') : null;
  }
  if (!text) return [];
  return (JSON.parse(text) as { explanations: Confirmed[] }).explanations;
}

/** What the pane says beside each block: confirmed, drafted and unconfirmed, or not explained yet. */
export function explanationsFor(
  site: SiteLocation,
  blocks: Block[],
  opts: { commit?: string; env?: NodeJS.ProcessEnv } = {},
): Explanation[] {
  const env = opts.env ?? process.env;
  const confirmed = new Map(confirmedIn(site.repoDir, opts.commit).map((c) => [c.hash, c]));
  // At a commit, a draft stands only when it was drafted at that commit or before it (reviewer run 1).
  const known = new Map<string, boolean>();
  const stood = (d: Drafted) => {
    if (!opts.commit) return true;
    if (!d.commit) return false;
    if (!known.has(d.commit)) {
      let yes: boolean;
      try {
        execFileSync(
          'git',
          ['-C', site.repoDir, 'merge-base', '--is-ancestor', d.commit, opts.commit],
          { stdio: 'ignore' },
        );
        yes = true;
      } catch {
        yes = false; // not an ancestor, or not a commit of this checkout
      }
      known.set(d.commit, yes);
    }
    return known.get(d.commit)!;
  };
  return blocks.map((b) => {
    const c = confirmed.get(b.hash);
    const found = drafted(site.id, b.hash, env);
    const d = found && stood(found) ? found : null;
    if (c)
      return {
        state: 'confirmed',
        sentence: c.sentence,
        figure: d?.figure ?? null,
        by: c.by,
        at: c.at,
      };
    if (d)
      return {
        state: 'unconfirmed',
        sentence: d.sentence,
        figure: d.figure,
        drafter: `${d.vendor} (${d.model})`,
      };
    return { state: 'none' };
  });
}

/** The glossary's banned developer words (design/harmony/glossary.json) found in a sentence. */
export function bannedWords(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const file = path.join(homeDir(env), 'design/harmony/glossary.json');
  const banned = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { banned: string[] }).banned
    : [];
  const forms = (w: string) =>
    w.endsWith('y') ? `${w.slice(0, -1)}(?:y|ies)` : `${w}(?:s|es|ed|ted|ing|ting)?`;
  if (!banned.length) return [];
  return [...text.matchAll(new RegExp(`\\b(?:${banned.map(forms).join('|')})\\b`, 'gi'))].map(
    (m) => m[0],
  );
}

const Sentence = z.object({
  sentence: z.string().min(3).max(400),
  figure: z.string().max(120).nullable(),
});

/** The names a block's file imports that the block itself uses. */
function importsUsed(blocks: Block[], b: Block): string[] {
  const imports = blocks
    .filter((x) => x.kind === 'imports')
    .map((x) => x.text)
    .join('\n');
  const names = [...imports.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))/g)].flatMap((m) =>
    (m[1] ?? m[2] ?? '').split(',').map((n) =>
      n
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .replace(/^type\s+/, ''),
    ),
  );
  return [...new Set(names.filter((n) => n && new RegExp(`\\b${n}\\b`).test(b.text)))];
}

/**
 * Drafts a sentence for every block of a file that has none yet, one call per block. Returns the number
 * drafted; nothing is drafted (and nothing fails) when the drafter has no key.
 */
export async function explainFile(
  site: SiteLocation,
  file: string,
  source: string,
  figuresOf: (b: Block) => BlockFigure[],
  opts: {
    env?: NodeJS.ProcessEnv;
    call?: typeof call;
    createdBy?: string;
    /** The commit the file stands at, which the drafts are made at. */
    commit?: string | null;
    lift?: number;
  } = {},
): Promise<{ drafted: number; failed: string | null }> {
  const env = opts.env ?? process.env;
  const blocks = splitBlocks(file, source);
  let n = 0;
  for (const b of blocks) {
    if (drafted(site.id, b.hash, env)) continue;
    try {
      const figures = figuresOf(b);
      const res = await (opts.call ?? call)({
        name: 'explain',
        version: 1,
        input: {
          file,
          kind: b.kind,
          name: b.name,
          code: b.text,
          imports: importsUsed(blocks, b),
          figures,
        },
        output: Sentence,
        role: 'drafter',
        siteId: site.id,
        createdBy: opts.createdBy ?? EXPLAIN_COMPONENT,
        maxTokens: 1500,
      });
      // A sentence in developer words is not kept: the block stays "Not explained yet".
      if (bannedWords(res.output.sentence, env).length) continue;
      const d: Drafted = {
        hash: b.hash,
        path: file,
        kind: b.kind,
        name: b.name,
        sentence: res.output.sentence.trim(),
        // The pane names only a figure the mapping gave; anything else the drafter says is dropped.
        figure: figures.find((f) => f.title === res.output.figure)?.title ?? null,
        vendor: res.vendor,
        model: res.model,
        callId: res.callId,
        at: new Date().toISOString(),
        commit: opts.commit ?? null,
        ...(opts.lift !== undefined ? { lift: opts.lift } : {}),
      };
      mkdirSync(cacheDir(site.id, env), { recursive: true });
      writeFileSync(cacheFile(site.id, b.hash, env), `${JSON.stringify(d, null, 2)}\n`);
      n++;
    } catch (err) {
      // No key, or the drafter failed: the block stays "Not explained yet"; the build goes on.
      return { drafted: n, failed: (err as Error).message };
    }
  }
  return { drafted: n, failed: null };
}

/**
 * A named person confirms a drafted sentence: it is written to the product's overlay, and the
 * confirmation to audit_log (Invariant 8). A sentence that was never drafted cannot be confirmed.
 */
export async function confirmExplanation(
  db: Db,
  site: SiteLocation,
  hash: string,
  who: Member,
  opts: { env?: NodeJS.ProcessEnv; now?: () => Date } = {},
): Promise<Confirmed> {
  const env = opts.env ?? process.env;
  const d = drafted(site.id, hash, env);
  if (!d) throw new Error('there is no drafted sentence for this block to confirm');
  const all = confirmedIn(site.repoDir);
  if (all.some((c) => c.hash === hash)) throw new Error('this sentence is already confirmed');
  let commit: string | null;
  try {
    commit = execFileSync('git', ['-C', site.repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    commit = null;
  }
  const c: Confirmed = {
    hash,
    path: d.path,
    name: d.name,
    sentence: d.sentence,
    by: who.name,
    at: (opts.now ?? (() => new Date()))().toISOString(),
    commit,
  };
  await db.insert(auditLog).values({
    siteId: site.id,
    tableName: 'explanations',
    rowId: hash,
    action: 'confirm',
    payload: c,
    createdBy: who.id,
  });
  const f = path.join(site.repoDir, EXPLANATIONS_FILE);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify({ explanations: [...all, c] }, null, 2)}\n`);
  return c;
}
