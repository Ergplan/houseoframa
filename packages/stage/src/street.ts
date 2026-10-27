// street(blueprint, features) → the Street: one building per thing the product does, standing on the
// ground; the tables are plots in the ground, lit when a building touches them; roads are one building
// using another; the lake is the edge of the product and the outside services sit across the water as
// jetties. A pure, deterministic function: the same Blueprint and features give the same Street.
import type { Blueprint, BrickNode } from '@rama/shared';
import type { BuildingKind, Features } from './features.ts';
import { project, type Pt } from './iso.ts';
import { servicesOf } from './services.ts';

/** What a floor holds, bottom to top: what it remembers, decides, who it talks to, what it shows. */
export type FloorKind = 'remembers' | 'decides' | 'talks' | 'shows';
export const FLOOR_ORDER: readonly FloorKind[] = ['remembers', 'decides', 'talks', 'shows'];
export const FLOOR_LABEL: Record<FloorKind, string> = {
  remembers: 'What it remembers',
  decides: 'What it decides',
  talks: 'Who it talks to',
  shows: 'What it shows',
};

export const BRICK_H = 6;
export const BRICK_GAP = 2;
export const FLOOR_PAD = 5;
export const MIN_FLOOR = 22;
/** No building stands lower than this, so the smallest still reads as a building. */
export const MIN_HEIGHT = 56;
/** A building's slot on the grid: the largest footprint and the road around it, in tiles. */
export const SLOT = 6;
const MAX_SIDE = 4;
const LAKE = 5;
const BANK = 3;
const PLOT_W = 3;
const PLOT_D = 2;
/** Room above the tallest roof for the name, the flag and the cranes. */
const SKY = 150;
const MARGIN = 40;

export interface StreetBrick {
  path: string;
  /** Position on the building's right face: u across (0–1), z up in pixels. */
  u0: number;
  u1: number;
  z0: number;
  z1: number;
}

export interface StreetFloor {
  kind: FloorKind;
  label: string;
  z0: number;
  z1: number;
  bricks: StreetBrick[];
}

export interface StreetBuilding {
  id: string;
  name: string;
  does: string | null;
  kind: BuildingKind;
  source: 'file' | 'draft';
  confirmed: { by: string; at: string } | null;
  gx: number;
  gy: number;
  /** Footprint, tiles square. */
  side: number;
  /** Height in pixels. */
  height: number;
  floors: StreetFloor[];
  screens: string[];
  bricks: string[];
  tables: { name: string; reads: boolean; writes: boolean }[];
  services: string[];
  /** One facade per screen, with its picture once the screens are photographed. */
  facades: { screen: string; shot: string | null }[];
}

export interface Plot {
  table: string;
  file: string;
  gx: number;
  gy: number;
  w: number;
  d: number;
  /** Buildings that read or write it. */
  readBy: string[];
  writtenBy: string[];
}

export interface Road {
  from: string;
  to: string;
  /** Ground points the road runs through, in tiles. */
  points: { gx: number; gy: number }[];
  /** True when every use is a type only: drawn dotted. */
  typeOnly: boolean;
  /** How many file-to-file uses it carries. */
  uses: number;
}

/** An area of the ground, in tiles. */
export interface Area {
  gx0: number;
  gy0: number;
  gx1: number;
  gy1: number;
}

export interface Jetty {
  service: string;
  /** The pier across the water, and the landing on the far bank. */
  pier: Area;
  landing: Area;
  /** Buildings that talk to it. */
  users: string[];
}

export interface Street {
  buildings: StreetBuilding[];
  plots: Plot[];
  roads: Road[];
  jetties: Jetty[];
  ground: Area;
  /** The lake (the edge of the product) and the far bank, where the outside services stand. */
  lake: Area;
  bank: Area;
  /** Everything drawn on the ground, from (0, 0): its width (gx) and depth (gy) in tiles. */
  extent: { w: number; d: number };
  /** The picture's size, and the offset added to every projected point. */
  width: number;
  height: number;
  origin: Pt;
  /** Files not drawn on the Street. */
  notDrawn: number;
}

export interface StreetOptions {
  /** The photographed screens: screen id → picture path. */
  shots?: Record<string, string>;
}

/** Which floor a file stands on. */
export function floorOf(node: BrickNode, screenFiles: ReadonlySet<string>): FloorKind {
  if (servicesOf(node).length) return 'talks';
  if (node.tables?.length || node.layer === 'data') return 'remembers';
  if (
    screenFiles.has(node.path) ||
    /\.(tsx|jsx)$/.test(node.path) ||
    node.layer === 'interface' ||
    node.layer === 'shell'
  )
    return 'shows';
  return 'decides';
}

export const sideFor = (n: number) => (n <= 6 ? 2 : n <= 30 ? 3 : MAX_SIDE);
/** Bricks per row on a face of `side` tiles. */
export const perRow = (side: number) => side * 4;

/** Floors of a building, with each brick's place on its face. Empty floors are left out. */
export function floorsFor(
  bricks: string[],
  side: number,
  nodeOf: (p: string) => BrickNode,
  screenFiles: ReadonlySet<string>,
): StreetFloor[] {
  const per = perRow(side);
  const floors: StreetFloor[] = [];
  let z = 0;
  for (const kind of FLOOR_ORDER) {
    const paths = bricks.filter((p) => floorOf(nodeOf(p), screenFiles) === kind).sort();
    if (!paths.length) continue;
    const rows = Math.ceil(paths.length / per);
    const h = Math.max(MIN_FLOOR, FLOOR_PAD * 2 + rows * (BRICK_H + BRICK_GAP) - BRICK_GAP);
    const placed = paths.map((path, i) => {
      const row = Math.floor(i / per);
      const col = i % per;
      const z0 = z + FLOOR_PAD + row * (BRICK_H + BRICK_GAP);
      return { path, u0: (col + 0.12) / per, u1: (col + 0.88) / per, z0, z1: z0 + BRICK_H };
    });
    floors.push({ kind, label: FLOOR_LABEL[kind], z0: z, z1: z + h, bricks: placed });
    z += h;
  }
  return floors;
}

export function street(bp: Blueprint, features: Features, opts: StreetOptions = {}): Street {
  const nodes = new Map(bp.nodes.map((n) => [n.path, n]));
  const nodeOf = (p: string) => nodes.get(p)!;
  const screenFiles = new Set(bp.screens.map((s) => s.file));
  const list = features.list.filter((f) => f.bricks.length || f.screens.length);
  const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
  const rows = Math.max(1, Math.ceil(list.length / cols));

  const buildings: StreetBuilding[] = list.map((f, i) => {
    const side = sideFor(f.bricks.length);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const floors = floorsFor(f.bricks, side, nodeOf, screenFiles);
    const tables = new Map<string, { name: string; reads: boolean; writes: boolean }>();
    for (const p of f.bricks)
      for (const t of nodeOf(p).tables ?? []) {
        const prev = tables.get(t.name) ?? { name: t.name, reads: false, writes: false };
        tables.set(t.name, {
          name: t.name,
          reads: prev.reads || t.reads,
          writes: prev.writes || t.writes,
        });
      }
    return {
      id: f.id,
      name: f.name,
      does: f.does,
      kind: f.kind,
      source: f.source,
      confirmed: f.confirmed,
      gx: col * SLOT + (SLOT - side) / 2,
      gy: row * SLOT + (SLOT - side) / 2,
      side,
      height: Math.max(MIN_HEIGHT, floors.at(-1)?.z1 ?? 0),
      floors,
      screens: f.screens,
      bricks: f.bricks,
      tables: [...tables.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
      services: [...new Set(f.bricks.flatMap((p) => servicesOf(nodeOf(p))))].sort(),
      facades: f.screens.map((s) => ({ screen: s, shot: opts.shots?.[s] ?? null })),
    };
  });

  // The ground: the buildings' slots, then a strip of plots in front.
  const gx1 = cols * SLOT;
  const plotsPerRow = Math.max(1, Math.floor(gx1 / (PLOT_W + 1)));
  const tables = bp.tables ?? [];
  const plots: Plot[] = tables.map((t, i) => ({
    table: t.name,
    file: t.file,
    gx: 0.5 + (i % plotsPerRow) * (PLOT_W + 1),
    gy: rows * SLOT + 0.5 + Math.floor(i / plotsPerRow) * (PLOT_D + 1),
    w: PLOT_W,
    d: PLOT_D,
    readBy: buildings
      .filter((b) => b.tables.some((x) => x.name === t.name && x.reads))
      .map((b) => b.id),
    writtenBy: buildings
      .filter((b) => b.tables.some((x) => x.name === t.name && x.writes))
      .map((b) => b.id),
  }));
  const plotRows = tables.length ? Math.ceil(tables.length / plotsPerRow) : 0;
  const gy1 = rows * SLOT + plotRows * (PLOT_D + 1) + (plotRows ? 0.5 : 0);

  // Roads: building A uses building B when a file of A imports a file of B.
  const owner = new Map(buildings.flatMap((b) => b.bricks.map((p) => [p, b] as const)));
  const pairs = new Map<string, Road>();
  for (const e of bp.edges) {
    const a = owner.get(e.from);
    const b = owner.get(e.to);
    if (!a || !b || a === b) continue;
    const key = `${a.id}\0${b.id}`;
    const r = pairs.get(key);
    if (r) {
      r.uses += 1;
      r.typeOnly = r.typeOnly && e.typeOnly;
    } else
      pairs.set(key, {
        from: a.id,
        to: b.id,
        points: roadPoints(a, b),
        typeOnly: e.typeOnly,
        uses: 1,
      });
  }
  const roads = [...pairs.values()].sort((x, y) =>
    x.from === y.from ? (x.to < y.to ? -1 : 1) : x.from < y.from ? -1 : 1,
  );

  // Jetties: one per outside service, spread along the shore.
  const services = [...new Set(buildings.flatMap((b) => b.services))].sort();
  const lake = { gx0: gx1, gy0: 0, gx1: gx1 + LAKE, gy1 };
  const bank = { gx0: lake.gx1, gy0: 0, gx1: lake.gx1 + (services.length ? BANK : 0), gy1 };
  const jetties: Jetty[] = services.map((service, i) => {
    const gy = ((i + 1) * gy1) / (services.length + 1);
    return {
      service,
      pier: { gx0: lake.gx0, gy0: gy - 0.35, gx1: lake.gx1, gy1: gy + 0.35 },
      landing: { gx0: bank.gx0 + 0.3, gy0: gy - 0.8, gx1: bank.gx0 + 1.9, gy1: gy + 0.8 },
      users: buildings.filter((b) => b.services.includes(service)).map((b) => b.id),
    };
  });

  // The picture's bounds: every corner of the ground, the lake and the far bank, and the tallest roof.
  const tallest = Math.max(0, ...buildings.map((b) => b.height));
  const corners = [
    project(0, 0, tallest + SKY),
    project(bank.gx1, 0, SKY),
    project(bank.gx1, gy1),
    project(0, gy1),
    project(0, 0),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  return {
    buildings,
    plots,
    roads,
    jetties,
    ground: { gx0: 0, gy0: 0, gx1, gy1 },
    lake,
    bank,
    extent: { w: bank.gx1, d: gy1 },
    width: Math.ceil(maxX - minX + MARGIN * 2),
    height: Math.ceil(maxY - minY + MARGIN * 2),
    origin: { x: Math.round(MARGIN - minX), y: Math.round(MARGIN - minY) },
    notDrawn: features.notDrawn.length,
  };
}

/** The road from A's front door to B's: down to the road in front of A's row, along it, up to B. */
function roadPoints(a: StreetBuilding, b: StreetBuilding): { gx: number; gy: number }[] {
  const door = (x: StreetBuilding) => ({ gx: x.gx + x.side / 2, gy: x.gy + x.side });
  const rowRoad = (x: StreetBuilding) => Math.floor(x.gy / SLOT) * SLOT + SLOT - 0.5;
  const colRoad = (x: StreetBuilding) => Math.floor(x.gx / SLOT) * SLOT + SLOT - 0.5;
  const da = door(a);
  const db = door(b);
  const ya = rowRoad(a);
  const yb = rowRoad(b);
  if (ya === yb) return [da, { gx: da.gx, gy: ya }, { gx: db.gx, gy: yb }, db];
  // Different rows: along A's row road to the column road beside A, along it to B's row road.
  const cx = colRoad(a);
  return [
    da,
    { gx: da.gx, gy: ya },
    { gx: cx, gy: ya },
    { gx: cx, gy: yb },
    { gx: db.gx, gy: yb },
    db,
  ];
}

/** A world point to the picture, with the Street's offset. */
export function at(s: Pick<Street, 'origin'>) {
  return (gx: number, gy: number, z = 0): Pt => {
    const p = project(gx, gy, z);
    return { x: p.x + s.origin.x, y: p.y + s.origin.y };
  };
}
