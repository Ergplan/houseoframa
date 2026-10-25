// Shapes in the picture, shared by draw and pick so what is clicked is exactly what was drawn.
import type { BuildingScene } from './building.ts';
import { boxFaces, type Pt } from './iso.ts';
import {
  at,
  type Jetty,
  type Plot,
  type Street,
  type StreetBuilding,
  type StreetBrick,
} from './street.ts';

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** The part of a face between u0–u1 across and v0–v1 down, as [bottom-start, bottom-end, top-end, top-start]. */
export function subFace(face: Pt[], u0: number, u1: number, v0: number, v1: number): Pt[] {
  const [b0, b1, t1, t0] = face as [Pt, Pt, Pt, Pt];
  const top = (u: number) => lerp(t0, t1, u);
  const bottom = (u: number) => lerp(b0, b1, u);
  const p = (u: number, v: number) => lerp(top(u), bottom(u), v);
  return [p(u0, v1), p(u1, v1), p(u1, v0), p(u0, v0)];
}

/** A building's faces at a height (the height grows during the replay). */
export function buildingFaces(s: Pick<Street, 'origin'>, b: StreetBuilding, height = b.height) {
  return boxFaces(b.gx, b.gy, b.side, b.side, height, at(s));
}

/** A brick on a face whose base runs from z = 0 to z = height: its parallelogram. */
export function brickOnFace(face: Pt[], height: number, x: StreetBrick): Pt[] {
  return subFace(face, x.u0, x.u1, 1 - x.z1 / height, 1 - x.z0 / height);
}

export function plotPolygon(s: Pick<Street, 'origin'>, p: Plot): Pt[] {
  const a = at(s);
  return [a(p.gx, p.gy), a(p.gx + p.w, p.gy), a(p.gx + p.w, p.gy + p.d), a(p.gx, p.gy + p.d)];
}

/** The jetty's pier across the water, and the landing on the far bank. */
export function jettyShapes(s: Pick<Street, 'origin' | 'lake' | 'bank'>, j: Jetty) {
  const a = at(s);
  const half = 0.35;
  const pier = [
    a(s.lake.gx0, j.gy - half),
    a(s.lake.gx1, j.gy - half),
    a(s.lake.gx1, j.gy + half),
    a(s.lake.gx0, j.gy + half),
  ];
  const landing = boxFaces(s.bank.gx0 + 0.3, j.gy - 0.8, 1.6, 1.6, 26, a);
  return { pier, landing };
}

/** The building level's facade panel, and a figure's hotspot on it. */
export function facadeShape(scene: BuildingScene, u0: number, u1: number, v0 = 0, v1 = 1): Pt[] {
  return subFace(scene.faces.left, u0, u1, v0, v1);
}
