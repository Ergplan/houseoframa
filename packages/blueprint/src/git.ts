// Everything the extractor knows about a repository comes through here: git and the file tree.
// Every call pins the output format (-z, fixed --format, explicit rename detection, no color, no
// pager, no mailmap) so the same repository yields the same bytes on any machine.
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import type { Commit } from '@rama/shared';
import { matchGlob } from './glob.ts';
import { byString } from './json.ts';

const GIT_CONFIG = ['-c', 'core.quotepath=off', '-c', 'diff.renames=true', '-c', 'log.showSignature=false'];

export function git(repo: string, args: string[], input?: Buffer | string): Buffer {
  const res = spawnSync('git', ['-C', repo, ...GIT_CONFIG, ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${repo}: ${res.stderr.toString().trim()}`);
  }
  return res.stdout;
}

const text = (repo: string, args: string[]) => git(repo, args).toString('utf8');

/** Pathspecs that leave out excluded globs, for log, diff and status. */
export function pathspec(exclude: string[]): string[] {
  return ['--', '.', ...exclude.map((g) => `:(exclude,glob)${g}`)];
}

export function revParse(repo: string, rev: string): string | null {
  const res = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  return res.status === 0 ? res.stdout.toString().trim() : null;
}

export function topLevel(repo: string): string {
  return text(repo, ['rev-parse', '--show-toplevel']).trim();
}

export function committerDate(repo: string, sha: string): string {
  return text(repo, ['show', '-s', '--format=%cI', sha]).trim();
}

export interface TreeFile {
  path: string;
  content: Buffer;
}

/** Tracked files at a commit, read from git's object store: the working tree is never consulted. */
export function readCommitTree(repo: string, sha: string, exclude: string[]): TreeFile[] {
  const entries = git(repo, ['ls-tree', '-r', '-z', '--full-tree', sha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, oid] = line.slice(0, tab).split(' ');
      return { mode: mode!, type: type!, oid: oid!, path: line.slice(tab + 1) };
    })
    .filter((e) => e.type === 'blob' && !isExcluded(e.path, exclude));
  if (!entries.length) return [];

  // One cat-file process for every blob: "<oid> blob <size>\n<bytes>\n" per object.
  const out = git(repo, ['cat-file', '--batch'], entries.map((e) => e.oid).join('\n') + '\n');
  const files: TreeFile[] = [];
  let pos = 0;
  for (const e of entries) {
    const nl = out.indexOf(0x0a, pos);
    const header = out.subarray(pos, nl).toString('utf8').split(' ');
    const size = Number(header[2]);
    files.push({ path: e.path, content: out.subarray(nl + 1, nl + 1 + size) });
    pos = nl + 1 + size + 1;
  }
  return files.sort((a, b) => byString(a.path, b.path));
}

/** Tracked files as they are in the working tree (index paths, disk contents). Deleted files are skipped. */
export function readWorktree(repo: string, exclude: string[]): TreeFile[] {
  const root = topLevel(repo);
  const paths = git(root, ['ls-files', '-z', '--cached'])
    .toString('utf8')
    .split('\0')
    .filter((p) => p && !isExcluded(p, exclude));
  const files: TreeFile[] = [];
  for (const p of [...new Set(paths)]) {
    const full = path.join(root, p);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue; // deleted in the working tree
    }
    if (st.isSymbolicLink()) files.push({ path: p, content: Buffer.from(readlinkSync(full)) });
    else if (st.isFile()) files.push({ path: p, content: readFileSync(full) });
  }
  return files.sort((a, b) => byString(a.path, b.path));
}

export function isExcluded(p: string, exclude: string[]): boolean {
  return exclude.some((g) => matchGlob(g, p));
}

/**
 * The commit a working-tree extraction sits on. When the working tree differs from HEAD (outside the
 * excluded paths), it is HEAD. When it does not, the tree's content was committed in the most recent
 * commit that touched a non-excluded path, and the base is that commit's parent. So the Blueprint of
 * pending changes, generated before a commit, equals the Blueprint regenerated after it: this is what
 * lets a repository carry its own Blueprint without chasing its own tail.
 */
export function worktreeBase(repo: string, exclude: string[]): string | null {
  const head = revParse(repo, 'HEAD');
  if (!head) return null;
  const dirty =
    git(repo, ['status', '--porcelain', '-z', '--untracked-files=no', ...pathspec(exclude)]).length > 0;
  if (dirty) return head;
  const last = text(repo, ['log', '--first-parent', '-1', '--format=%H', 'HEAD', ...pathspec(exclude)]).trim();
  if (!last) return null;
  return revParse(repo, `${last}^`);
}

type Change = Commit['changes'][number];

function parseRecords(raw: string): { header: string[]; body: string[] }[] {
  return raw
    .split('\x1e')
    .filter(Boolean)
    .map((rec) => {
      const end = rec.indexOf('\0');
      const header = (end === -1 ? rec : rec.slice(0, end)).split('\x1f');
      const body = end === -1 ? [] : rec.slice(end + 1).replace(/^\n/, '').split('\0');
      return { header, body };
    });
}

/** Full history reachable from `sha`, oldest first, with per-file kind, line counts and authors. */
export function readHistory(repo: string, sha: string | null): Commit[] {
  if (!sha) return [];
  const base = ['log', sha, '--reverse', '-M', '-z', '--no-color', '--no-ext-diff', '--no-mailmap'];
  const statusRaw = text(repo, [...base, '--format=%x1e%H%x1f%aI%x1f%an%x1f%s', '--name-status']);
  const numRaw = text(repo, [...base, '--format=%x1e%H', '--numstat']);

  // numstat: "add\tdel\tpath" or, for a rename, "add\tdel\t" followed by old and new path entries.
  const counts = new Map<string, { add: number | null; del: number | null }>();
  for (const { header, body } of parseRecords(numRaw)) {
    const commit = header[0]!;
    for (let i = 0; i < body.length; i++) {
      const entry = body[i]!;
      if (!entry) continue;
      const [a, d, p] = entry.split('\t');
      let file = p!;
      if (file === '') {
        file = body[i + 2]!;
        i += 2;
      }
      counts.set(`${commit}\0${file}`, {
        add: a === '-' ? null : Number(a),
        del: d === '-' ? null : Number(d),
      });
    }
  }

  const commits: Commit[] = [];
  for (const { header, body } of parseRecords(statusRaw)) {
    const [full, at, author, ...subject] = header;
    const changes: Change[] = [];
    for (let i = 0; i < body.length; i++) {
      const status = body[i]!;
      if (!status) continue;
      const letter = status[0]!;
      let change: Change;
      if (letter === 'R' || letter === 'C') {
        const from = body[i + 1]!;
        const to = body[i + 2]!;
        i += 2;
        change = { path: to, kind: letter === 'R' ? 'R' : 'A', add: null, del: null, ...(letter === 'R' ? { from } : {}) };
      } else {
        const p = body[i + 1]!;
        i += 1;
        change = { path: p, kind: letter === 'A' || letter === 'D' ? letter : 'M', add: null, del: null };
      }
      const n = counts.get(`${full}\0${change.path}`);
      if (n) Object.assign(change, n);
      changes.push(change);
    }
    changes.sort((a, b) => byString(a.path, b.path));
    commits.push({
      sha: full!,
      short: full!.slice(0, 7),
      at: at!,
      author: author!,
      subject: subject.join('\x1f'),
      changes,
    });
  }
  return commits;
}

/** Local and remote branch names (remote prefix and HEAD pointers removed), deduplicated and sorted. */
export function readBranches(repo: string): string[] {
  const refs = text(repo, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'])
    .split('\n')
    .filter(Boolean)
    .filter((r) => !r.endsWith('/HEAD'))
    .map((r) => r.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, ''));
  return [...new Set(refs)].sort(byString);
}

export function readTags(repo: string): string[] {
  return text(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/tags'])
    .split('\n')
    .filter(Boolean)
    .sort(byString);
}
