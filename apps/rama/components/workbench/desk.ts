// What the Build desk opens on (Stage 12): the code pane shows the file the builder wrote last, when no
// lift is being written; a lift in hand takes the pane over as it types.
import type { Blueprint } from '@rama/shared';

const CODE = /\.(tsx?|jsx?)$/;

/** The code file the newest commit changed most, or null when no commit changed one. */
export function latestFile(bp: Pick<Blueprint, 'commits' | 'nodes'>): string | null {
  const known = new Set(bp.nodes.map((n) => n.path));
  const newest = [...bp.commits].sort((a, b) => b.at.localeCompare(a.at));
  for (const c of newest) {
    const files = c.changes
      .filter((x) => x.kind !== 'D' && CODE.test(x.path) && known.has(x.path))
      .sort((a, b) => (b.add ?? 0) - (a.add ?? 0));
    if (files[0]) return files[0].path;
  }
  return null;
}
