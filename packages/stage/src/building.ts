// building(feature, facades) → the second level: one building, large. The front face is glass with the
// real screenshot of each of its screens behind it, each figure outlined where the screen shows it (a
// hotspot to its trail); the side face shows the floors (what it shows, decides, remembers, talks to)
// with their bricks through the glass. Pure and deterministic.
import type { BrickNode } from '@rama/shared';
import { boxFaces, project, TILE_H, TILE_W, type Pt } from './iso.ts';
import {
  FLOOR_ORDER,
  FLOOR_LABEL,
  floorOf,
  type StreetBuilding,
  type StreetFloor,
} from './street.ts';

/** A photographed screen as the building's facade takes it. */
export interface FacadeInput {
  screen: string;
  title: string;
  /** The picture's address; null before the screens are photographed. */
  shot: string | null;
  width: number;
  height: number;
  figures: {
    /** The appearance key (one per figure shown, even when two share an id). */
    key: string;
    id: string;
    traced: boolean;
    text?: string;
    box: { x: number; y: number; w: number; h: number };
  }[];
}

export interface FacadePanel {
  screen: string;
  title: string;
  shot: string | null;
  /** Across the front face, 0–1. */
  u0: number;
  u1: number;
  /** The part of the picture shown: the top of the screen, as tall as the face allows. */
  crop: { sx: number; sy: number; sw: number; sh: number } | null;
  /** v at which the picture ends (1 when it fills the face). */
  vEnd: number;
  figures: {
    key: string;
    id: string;
    traced: boolean;
    text: string | null;
    /** On the panel's face, 0–1; null when the figure sits below what the face shows. */
    at: { u0: number; u1: number; v0: number; v1: number } | null;
  }[];
}

export interface BuildingScene {
  id: string;
  name: string;
  width: number;
  height: number;
  origin: Pt;
  /** Footprint (front width w, depth d, in tiles) and height in pixels. */
  w: number;
  d: number;
  h: number;
  faces: { top: Pt[]; left: Pt[]; right: Pt[]; outline: Pt[] };
  /** The face toward the camera that carries the screens (camera.ts orientScene); left from the north. */
  facadeFace?: 'left' | 'right';
  /** Room beside the building for the floor labels, in pixels. */
  labels: number;
  floors: StreetFloor[];
  facades: FacadePanel[];
}

export const B_BRICK_H = 12;
export const B_GAP = 4;
export const B_PAD = 10;
export const B_MIN_FLOOR = 44;
export const MIN_FACADE = 420;
const DEPTH = 5;
const PER_ROW = 10;
const MARGIN = 60;
const LABELS = 190; // room right of the building for the floor labels
const HYP = Math.hypot(TILE_W / 2, TILE_H / 2);

export function building(
  b: StreetBuilding,
  facades: FacadeInput[],
  nodeOf: (path: string) => BrickNode,
  screenFiles: ReadonlySet<string>,
): BuildingScene {
  // Floors at this level: larger bricks, the same order and the same floor for every file.
  const floors: StreetFloor[] = [];
  let z = 0;
  for (const kind of FLOOR_ORDER) {
    const paths = b.bricks.filter((p) => floorOf(nodeOf(p), screenFiles) === kind).sort();
    if (!paths.length) continue;
    const rows = Math.ceil(paths.length / PER_ROW);
    const h = Math.max(B_MIN_FLOOR, B_PAD * 2 + rows * (B_BRICK_H + B_GAP) - B_GAP);
    floors.push({
      kind,
      label: FLOOR_LABEL[kind],
      z0: z,
      z1: z + h,
      bricks: paths.map((path, i) => {
        const row = Math.floor(i / PER_ROW);
        const col = i % PER_ROW;
        const z0 = z + B_PAD + row * (B_BRICK_H + B_GAP);
        return {
          path,
          u0: (col + 0.1) / PER_ROW,
          u1: (col + 0.9) / PER_ROW,
          z0,
          z1: z0 + B_BRICK_H,
        };
      }),
    });
    z += h;
  }
  const shown = b.facades.map((f) => facades.find((x) => x.screen === f.screen) ?? null);
  const panels = Math.max(1, shown.length);
  const w = Math.max(6, panels * 5);
  const h = Math.max(MIN_FACADE, z);
  const faceLen = w * HYP; // the front face's length along its base, in pixels
  const facadePanels: FacadePanel[] = b.facades.map((f, i) => {
    const input = shown[i];
    const u0 = i / panels + 0.02 / panels;
    const u1 = (i + 1) / panels - 0.02 / panels;
    const width = (u1 - u0) * faceLen;
    if (!input || !input.shot || !input.width) {
      return {
        screen: f.screen,
        title: input?.title ?? f.screen,
        shot: null,
        u0,
        u1,
        crop: null,
        vEnd: 0,
        figures: [],
      };
    }
    const scale = width / input.width;
    const sh = Math.min(input.height, h / scale);
    const vEnd = (sh * scale) / h;
    return {
      screen: f.screen,
      title: input.title,
      shot: input.shot,
      u0,
      u1,
      crop: { sx: 0, sy: 0, sw: input.width, sh },
      vEnd,
      figures: input.figures.map((g) => ({
        key: g.key,
        id: g.id,
        traced: g.traced,
        text: g.text ?? null,
        at:
          g.box.y + g.box.h <= sh
            ? {
                u0: u0 + (g.box.x / input.width) * (u1 - u0),
                u1: u0 + ((g.box.x + g.box.w) / input.width) * (u1 - u0),
                v0: (g.box.y * scale) / h,
                v1: ((g.box.y + g.box.h) * scale) / h,
              }
            : null,
      })),
    };
  });

  const corners = [
    project(0, 0, h + 70),
    project(w, 0, h + 70),
    project(w, DEPTH),
    project(0, DEPTH),
    project(w, 0),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const origin = { x: Math.round(MARGIN - minX), y: Math.round(MARGIN - minY) };
  const atPt = (gx: number, gy: number, zz: number) => {
    const p = project(gx, gy, zz);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  return {
    id: b.id,
    name: b.name,
    width: Math.ceil(maxX - minX + MARGIN * 2 + LABELS),
    height: Math.ceil(maxY - minY + MARGIN * 2),
    origin,
    w,
    d: DEPTH,
    h,
    faces: boxFaces(0, 0, w, DEPTH, h, atPt),
    facadeFace: 'left',
    labels: LABELS,
    floors,
    facades: facadePanels,
  };
}

/** A world point of the building level to the picture. */
export function buildingAt(s: Pick<BuildingScene, 'origin'>) {
  return (gx: number, gy: number, z = 0): Pt => {
    const p = project(gx, gy, z);
    return { x: p.x + s.origin.x, y: p.y + s.origin.y };
  };
}
