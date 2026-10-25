// The isometric projection: a 2:1 tile grid. World coordinates are tiles (gx to the right and down, gy to
// the left and down) and pixels of height (z). The viewer looks at the corner of largest gx + gy, so a
// thing drawn later (larger gx + gy) stands in front.

export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt {
  x: number;
  y: number;
}

/** A world point (tiles, tiles, pixels up) to the picture, before the scene's offset. */
export function project(gx: number, gy: number, z = 0): Pt {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 - z };
}

/** The depth of a footprint's front corner: larger is nearer the viewer. */
export const depth = (gx: number, gy: number) => gx + gy;

/** Whether a point lies inside a polygon (even-odd rule). */
export function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** The three faces of a box standing on (gx, gy) with footprint w × d tiles and height h pixels. */
export function boxFaces(
  gx: number,
  gy: number,
  w: number,
  d: number,
  h: number,
  at: (gx: number, gy: number, z: number) => Pt,
): { top: Pt[]; left: Pt[]; right: Pt[]; outline: Pt[] } {
  const p = (x: number, y: number, z: number) => at(gx + x, gy + y, z);
  const top = [p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)];
  // The left face looks along +gy (toward the viewer's left); the right face along +gx.
  const left = [p(0, d, 0), p(w, d, 0), p(w, d, h), p(0, d, h)];
  const right = [p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)];
  const outline = [p(0, 0, h), p(w, 0, h), p(w, 0, 0), p(w, d, 0), p(0, d, 0), p(0, d, h)];
  return { top, left, right, outline };
}

/**
 * The affine map from a face's own coordinates (u across, v down, both 0–1) to the picture, for a face
 * given as [bottom-start, bottom-end, top-end, top-start]: what a canvas `setTransform` takes to paint a
 * picture on it.
 */
export function faceTransform(face: Pt[]): {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
} {
  const [b0, b1, , t0] = face as [Pt, Pt, Pt, Pt];
  // u runs from start to end, v from top to bottom.
  return { a: b1.x - b0.x, b: b1.y - b0.y, c: b0.x - t0.x, d: b0.y - t0.y, e: t0.x, f: t0.y };
}

/** The inverse of faceTransform: a picture point to the face's (u, v), or null when outside 0–1. */
export function toFace(face: Pt[], p: Pt): { u: number; v: number } | null {
  const m = faceTransform(face);
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return null;
  const x = p.x - m.e;
  const y = p.y - m.f;
  const u = (m.d * x - m.c * y) / det;
  const v = (-m.b * x + m.a * y) / det;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}
