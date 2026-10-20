// pick(): what lies under a point on the building, in scene coordinates. Only bricks already built at
// this point of the replay can be picked; the door is there once the first lift is in.
import type { Blueprint } from '@rama/shared';
import { siteModel } from './frame.ts';
import type { Box } from './layout.ts';
import { brickState } from './timeline.ts';

export type Picked = { kind: 'brick'; path: string } | { kind: 'door' } | { kind: 'office' } | null;

const inside = (b: Box, x: number, y: number) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

export function pick(
  bp: Blueprint,
  commitIndex: number,
  progress: number,
  x: number,
  y: number,
): Picked {
  const { scene, timeline } = siteModel(bp);
  if (commitIndex >= 1 && inside(scene.door, x, y)) return { kind: 'door' };
  if (inside(scene.office, x, y)) return { kind: 'office' };
  const hit = scene.bricks.find(
    (b) => inside(b, x, y) && brickState(timeline, b.path, commitIndex, progress) === 'built',
  );
  return hit ? { kind: 'brick', path: hit.path } : null;
}

/** Converts a pointer position on the (CSS-scaled) canvas element to scene coordinates. */
export function toScene(
  rect: { left: number; top: number; width: number; height: number },
  scene: { width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) * scene.width) / rect.width,
    y: ((clientY - rect.top) * scene.height) / rect.height,
  };
}
