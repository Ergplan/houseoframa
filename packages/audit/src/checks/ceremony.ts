// Checks over the people's record: screens changed since their signature (or never signed), phrases
// nobody confirmed, decisions left open or not built. All are notes: they say what is unconfirmed, not
// that the code is wrong.
import { spawnSync } from 'node:child_process';
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import { changesSince } from '@rama/ceremony/gate';
import { signaturesInForce } from '@rama/ceremony/records';
import { SITE, type CheckFinding } from '../findings.ts';

/** Paths changed in the working tree on top of HEAD (tracked and untracked): for a working-tree Blueprint. */
function worktreeChanges(repoDir: string): string[] {
  const r = spawnSync(
    'git',
    ['-C', repoDir, 'status', '--porcelain', '-z', '--untracked-files=all'],
    {
      encoding: 'utf8',
    },
  );
  const out: string[] = [];
  const fields = (r.stdout ?? '').split('\0').filter(Boolean);
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    out.push(f.slice(3));
    // A rename or copy is followed by its old path.
    if (f[0] === 'R' || f[0] === 'C') out.push(fields[++i]!);
  }
  return out;
}

export function unsignedChanges(
  repoDir: string,
  bp: Blueprint,
  signoffs: Signoff[],
): CheckFinding[] {
  const inForce = signaturesInForce(signoffs);
  const out: CheckFinding[] = [];
  // A Blueprint read from the working tree carries its uncommitted changes: they count as changes too.
  const local = bp.worktree ? worktreeChanges(repoDir) : [];
  for (const s of bp.screens) {
    const sig = inForce.get(`screen:${s.id}`);
    if (!sig) {
      out.push({
        brick: s.file,
        check: 'unsigned-change',
        verdict: 'note',
        file: s.file,
        text: `The screen ${s.route} has never been signed.`,
      });
      continue;
    }
    let changed: string[];
    try {
      const since =
        sig.target.commit === bp.commit
          ? []
          : changesSince(repoDir, sig.target.commit).flatMap((c) => c.paths);
      changed = [...new Set([...since, ...local])].filter((p) => s.bricks.includes(p));
    } catch {
      changed = s.bricks;
    }
    if (changed.length) {
      out.push({
        brick: s.file,
        check: 'unsigned-change',
        verdict: 'note',
        file: s.file,
        text: `The screen ${s.route} changed since ${sig.person} signed it at ${sig.target.commit.slice(0, 7)} (${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ', …' : ''}).`,
      });
    }
  }
  return out;
}

export function unconfirmedGlossary(bp: Blueprint): CheckFinding[] {
  const by = new Map<string, number>();
  for (const e of bp.edges)
    if (e.english && !e.english.confirmed) by.set(e.from, (by.get(e.from) ?? 0) + 1);
  return [...by].map(([brick, n]) => ({
    brick,
    check: 'unconfirmed-glossary' as const,
    verdict: 'note' as const,
    file: brick,
    text: `${n} drafted phrase${n === 1 ? '' : 's'} about its imports ${n === 1 ? 'is' : 'are'} not confirmed by anyone.`,
  }));
}

export function openDecisions(bp: Blueprint, decisions: Decision[]): CheckFinding[] {
  const superseded = new Set(decisions.map((d) => d.supersedes).filter(Boolean));
  const files = new Set(bp.nodes.map((n) => n.path));
  const out: CheckFinding[] = [];
  for (const d of decisions) {
    if (superseded.has(d.id) || d.status === 'decided') continue;
    const text = `Decision "${d.title}" is ${d.status === 'open' ? 'still open' : 'decided but not built'}.`;
    const bricks = d.bricks.filter((b) => files.has(b));
    if (!bricks.length) out.push({ brick: SITE, check: 'open-decision', verdict: 'note', text });
    for (const b of bricks)
      out.push({ brick: b, check: 'open-decision', verdict: 'note', file: b, text });
  }
  return out;
}
