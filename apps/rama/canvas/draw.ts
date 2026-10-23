// draw(ctx, state): paints one frame of the building on a Canvas 2D context at scene scale (the caller
// sets the canvas to scene.width × scene.height and scales it with CSS). No state of its own.
// The sprites, the sign, the site office, the scaffold and the cranes are ported from the weekend
// prototype (reference/weekend-prototype/house-of-rama.html, "drawing helpers" and draw()).
import { frame, type Frame, type SiteState } from './frame.ts';
import type { Box, BrickBox, Crane, Scene } from './layout.ts';
import type { BrickMark } from '@rama/blueprint/metrics';
import { INK, UNTESTED, layerColor } from './palette.ts';

/** The part of CanvasRenderingContext2D the renderer uses (so tests can record calls). */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'fillRect'
  | 'strokeRect'
  | 'fillText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'closePath'
  | 'fill'
  | 'createLinearGradient'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'imageSmoothingEnabled'
>;

const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

const JCB = [
  '......YYYYYYY........',
  '.....YYYYYYYYY.......',
  '.....YDDDDDDY........',
  '.....YDCCCCDY........',
  'YYYYYYDCCCCDYYYYYYYY.',
  'YYYYYYYYYYYYYYYYYYYYY',
  'YYYYYYYYYYYYYYYYYYYYY',
  '.KKK.YYYYYYYYYY.KKK..',
  'KKKKK..........KKKKK.',
  'KKKKK..........KKKKK.',
  '.KKK............KKK..',
];
const JCB_PAL: Record<string, string> = { Y: '#ffb429', D: INK, C: '#9fe7ff', K: '#1b1b1b' };
const VERDICT_COLOR = { pass: '#5ad45a', note: '#ffb429', defect: '#ff5a6a' } as const;

export function draw(ctx: Ctx, state: SiteState): Frame {
  const f = frame(state);
  const s = f.scene;
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const text = (
    t: string,
    x: number,
    y: number,
    size: number,
    c: string,
    align: CanvasTextAlign = 'left',
  ) => {
    ctx.font = `${size}px ${PIXEL_FONT}`;
    ctx.fillStyle = c;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(t, Math.round(x), Math.round(y));
  };
  ctx.imageSmoothingEnabled = false;

  drawSky(ctx, f, R);
  drawSign(s, R, text, ctx);

  const b = s.building;
  if (!f.cleared) {
    R(b.x - 10, s.ground - 6, b.w + 20, 6, '#6b6b6b');
    R(b.x - 14, s.ground - 2, b.w + 28, 4, '#444');
  } else {
    R(b.x - 10, s.ground, b.w + 20, 10, '#1a1a1a');
    R(b.x + b.w / 2 - 150, s.ground - 60, 300, 40, 'rgba(10,9,20,.8)');
    text('SITE CLEARED · PRESS PLAY', b.x + b.w / 2, s.ground - 50, 8, '#fff', 'center');
    text('THE TEAM IS IN THE SITE OFFICE →', b.x + b.w / 2, s.ground - 32, 6, '#ffb429', 'center');
  }

  s.cranes.forEach((c, i) => {
    drawCrane(s, c, R, text);
    if (f.activeCrane === i) {
      R(c.x - 40, s.top - 140, 80, 14, INK);
      text('BUILDING', c.x, s.top - 136, 6, '#fff', 'center');
    }
  });
  drawOffice(s.office, s.ground, R, text);
  drawScaffolds(s, R, text);

  for (const { floor, built, total } of f.floors) {
    if (!built) {
      // Not started yet: the bare frame of the floor, so the floors above do not float.
      if (f.cleared) continue;
      R(b.x, floor.y - 6, b.w, 6, '#3a3746');
      R(b.x, floor.y, 3, floor.h, '#3a3746');
      R(b.x + b.w - 3, floor.y, 3, floor.h, '#3a3746');
      continue;
    }
    R(b.x, floor.y - 6, b.w, 6, '#4a4658');
    R(b.x, floor.y, b.w, floor.h, '#262233');
    R(b.x, floor.y, 2, floor.h, '#5a566a');
    R(b.x + b.w - 2, floor.y, 2, floor.h, '#15121f');
    const ly = floor.y + floor.h / 2;
    R(b.x - 130, ly - 9, 124, 18, INK);
    R(b.x - 130, ly - 9, 4, 18, floor.color);
    text(floor.short.slice(0, 10), b.x - 120, ly - 4, 7, floor.color);
    text(`${built}/${total}`, b.x - 12, ly - 4, 6, '#8f8a78', 'right');
  }

  for (const fb of f.bricks) {
    drawBrick(ctx, fb.box, fb.box.x, fb.box.y, R, fb.mark);
    if (fb.verdict) {
      // The badge stays on the brick: green pass, amber note, red defect.
      R(fb.box.x + fb.box.w - 7, fb.box.y - 3, 8, 8, INK);
      R(fb.box.x + fb.box.w - 6, fb.box.y - 2, 6, 6, VERDICT_COLOR[fb.verdict]);
    }
    if (fb.change) {
      const fl = fb.change.kind === 'demolish' ? '#ff4d5e' : '#fff';
      ctx.strokeStyle = fl;
      ctx.lineWidth = 2;
      ctx.strokeRect(fb.box.x - 2, fb.box.y - 2, fb.box.w + 4, fb.box.h + 4);
      text(fb.change.tag, fb.box.x + fb.box.w / 2, fb.box.y - 14, 7, fl, 'center');
    }
  }

  if (f.hook) {
    const jibY = s.top - 70;
    R(f.hook.x - 1, jibY + 12, 2, Math.max(0, f.hook.y - jibY - 12), '#ddd');
    R(f.hook.x - 6, f.hook.y - 6, 12, 6, '#ddd');
    ctx.globalAlpha = 0.9;
    drawBrick(ctx, f.hook.box, f.hook.x - f.hook.box.w / 2, f.hook.y, R);
    ctx.globalAlpha = 1;
  }

  ctx.lineWidth = 2;
  for (const c of f.cables) cable(ctx, c.from, c.to, c.color, R);

  if (f.glow.length) {
    const pulse = 0.55 + 0.45 * Math.sin((state.clock ?? 0) / 300);
    ctx.strokeStyle = `rgba(255,180,41,${pulse.toFixed(3)})`;
    ctx.lineWidth = 3;
    for (const g of f.glow) ctx.strokeRect(g.x - 3, g.y - 3, g.w + 6, g.h + 6);
  }
  if (f.selected) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(f.selected.x - 3, f.selected.y - 3, f.selected.w + 6, f.selected.h + 6);
  }

  if (f.door) {
    const dx = b.x + b.w / 2 - 22;
    const dy = s.ground - 34;
    R(dx - 4, dy - 12, 52, 46, INK);
    R(dx, dy, 44, 34, '#9fe7ff');
    R(dx + 20, dy, 4, 34, INK);
    R(dx + 2, dy + 2, 18, 30, 'rgba(255,255,255,.35)');
    text('SHOWROOM', dx + 22, dy - 10, 5, '#ffb429', 'center');
  }

  drawJcb(f, s, R);
  for (const d of f.dust) R(d.x, d.y, 3, 3, d.color);

  if (f.banner) {
    R(0, 0, s.width, 22, 'rgba(0,0,0,.45)');
    text(f.banner, 10, 7, 7, '#ffb429');
  }
  if (f.audit) drawAudit(ctx, f.audit, s, R, text, state.clock ?? 0);
  if (f.complete) {
    R(b.x + b.w / 2 - 130, s.top - 210, 260, 30, INK);
    text('ALL LIFTS IN · AWAITING SIGN-OFF', b.x + b.w / 2, s.top - 200, 6, '#5ad45a', 'center');
  }
  return f;
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;

// The audit drone, ported from the weekend prototype (reference/weekend-prototype/audit.js, DRONE).
const DRONE = ['..P.....P..', '..PPPPPPP..', '...PVVVP...', '..PPPPPPP..', '..P.....P..'];
const DRONE_PAL: Record<string, string> = { P: '#c98cff', V: '#ece8dc' };

function drawAudit(
  ctx: Ctx,
  a: NonNullable<Frame['audit']>,
  s: Scene,
  R: Rect,
  text: (
    t: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align?: CanvasTextAlign,
  ) => void,
  now: number,
) {
  if (a.beam) {
    const { from, box } = a.beam;
    ctx.fillStyle = 'rgba(201,140,255,.22)';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + 8);
    ctx.lineTo(box.x - 4, box.y + box.h + 2);
    ctx.lineTo(box.x + box.w + 4, box.y + box.h + 2);
    ctx.closePath();
    ctx.fill();
    const sy = box.y + ((now / 6) % (box.h + 4)) - 2;
    R(box.x - 4, sy, box.w + 8, 2, 'rgba(236,232,220,.8)');
  }
  a.drones.forEach((d, i) => {
    DRONE.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (DRONE_PAL[c]) R(d.x - 11 + x * 2, d.y - 5 + y * 2, 2, 2, DRONE_PAL[c]!);
      }),
    );
    if (Math.floor(now / 60) % 2) {
      R(d.x - 11, d.y - 5, 6, 2, '#fff');
      R(d.x + 5, d.y - 5, 6, 2, '#fff');
    }
    R(d.x - 1, d.y + 5, 2, 2, '#5ad45a');
    R(d.x - 34, d.y - 22, 68, 12, '#1a1200');
    text(`AUDIT ${i + 1}`, d.x, d.y - 19, 6, '#c98cff', 'center');
  });
  if (a.label) {
    R(0, 22, s.width, 18, 'rgba(12,11,19,.6)');
    text(a.label, 10, 27, 6, '#c98cff');
  }
}
type Text = (
  t: string,
  x: number,
  y: number,
  size: number,
  c: string,
  align?: CanvasTextAlign,
) => void;

function drawSky(ctx: Ctx, f: Frame, R: Rect) {
  const s = f.scene;
  const g = ctx.createLinearGradient(0, 0, 0, s.ground);
  g.addColorStop(0, f.sky.top);
  g.addColorStop(1, f.sky.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.width, s.ground);
  if (f.sky.sun) {
    const { x, y } = f.sky.sun;
    R(x - 10, y - 10, 20, 20, '#fff2a8');
    R(x - 14, y - 6, 28, 12, '#fff2a8');
    R(x - 6, y - 14, 12, 28, '#fff2a8');
  }
  if (f.sky.night > 0.1) {
    for (let i = 0; i < 60; i++) {
      R(
        (i * 241) % s.width,
        (i * 97) % Math.max(1, s.ground - 200),
        2,
        2,
        `rgba(255,255,255,${(f.sky.night * 0.9).toFixed(2)})`,
      );
    }
  }
  const skyline = f.sky.night > 0.5 ? '#20163a' : '#6c8fc2';
  for (let i = 0; i * 42 < s.width; i++) {
    const x = i * 42;
    const hh = 30 + ((i * 37) % 60);
    R(x, s.ground - hh, 30, hh, skyline);
    for (let j = 0; j < hh / 14 - 1; j++) {
      for (let q = 0; q < 3; q++)
        if ((i + j + q) % 3)
          R(
            x + 6 + q * 9,
            s.ground - hh + 8 + j * 14,
            4,
            5,
            f.sky.night > 0.5 ? '#ffd36b' : '#d5e4f7',
          );
    }
  }
  R(0, s.ground, s.width, s.height - s.ground, '#2a2a2a');
  R(0, s.ground, s.width, 4, '#555');
  for (let x = 0; x < s.width; x += 28) R(x, s.ground + 30, 14, 4, '#3a3a3a');
}

function drawSign(s: Scene, R: Rect, text: Text, ctx: Ctx) {
  const { x, y } = s.sign;
  R(x, y, 146, 78, '#f3e9c6');
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, 142, 74);
  R(x + 16, y + 78, 8, 82, '#5a3a1a');
  R(x + 122, y + 78, 8, 82, '#5a3a1a');
  text('HOUSE OF RAMA', x + 73, y + 10, 8, '#5a3a1a', 'center');
  text('BUILT ON TRUST', x + 73, y + 46, 6, '#2a2a2a', 'center');
}

function drawOffice(o: Box, ground: number, R: Rect, text: Text) {
  const x = o.x;
  const y = ground - 64;
  R(x, y, 140, 64, '#cfd3d8');
  R(x, y, 140, 6, '#5a5f66');
  R(x - 4, y - 2, 148, 4, '#3a3f45');
  R(x + 10, y + 16, 34, 22, '#9fe7ff');
  R(x + 26, y + 16, 2, 22, '#5a5f66');
  R(x + 10, y + 26, 34, 2, '#5a5f66');
  R(x + 96, y + 16, 34, 22, '#9fe7ff');
  R(x + 112, y + 16, 2, 22, '#5a5f66');
  R(x + 96, y + 26, 34, 2, '#5a5f66');
  R(x + 58, y + 22, 24, 42, '#5a3a1a');
  R(x + 76, y + 42, 3, 3, '#ffd36b');
  R(x + 8, y - 18, 124, 14, INK);
  text('SITE OFFICE · DISCOVERY', x + 70, y - 14, 5, '#ffb429', 'center');
  R(x - 2, ground, 144, 4, '#444');
}

function drawScaffolds(s: Scene, R: Rect, text: Text) {
  s.scaffolds.forEach((sc, i) => {
    for (let yy = s.ground; yy > s.top - 20; yy -= 24) {
      R(sc.x, yy - 24, 3, 24, '#9aa0a6');
      R(sc.x + sc.w, yy - 24, 3, 24, '#9aa0a6');
      R(sc.x, yy - 4, sc.w + 3, 3, '#c3c8cc');
      R(sc.x + 3, yy - 20, sc.w - 3, 2, '#777');
    }
    // Board names alternate height so neighbouring branch names do not overlap.
    const by = s.top - 26 - (i % 2) * 14;
    const more = i === s.scaffolds.length - 1 && s.moreBranches ? ` +${s.moreBranches}` : '';
    R(sc.x - 2, by, sc.w + 8, 10, '#ffb429');
    text((sc.branch + more).slice(0, 12), sc.x + sc.w / 2 + 1, by + 2, 5, INK, 'center');
  });
}

function drawCrane(s: Scene, c: Crane, R: Rect, text: Text) {
  const jy = s.top - 70;
  for (let yy = s.ground; yy > jy; yy -= 16) {
    R(c.x - 6, yy - 16, 12, 16, c.color);
    R(c.x - 4, yy - 12, 8, 2, INK);
    R(c.x - 4, yy - 6, 8, 2, INK);
  }
  // Each jib reaches a little past the gap to its neighbour, so two cranes never cross.
  const spacing = s.building.w / (s.cranes.length + 1);
  const reach = Math.round(Math.min(400, Math.max(140, spacing * 1.2)));
  if (c.jib === 'right') {
    R(c.x - 70, jy, reach, 8, c.color);
    R(c.x - 70, jy + 8, 60, 4, INK);
    for (let i = 0; i * 22 < reach - 70; i++) R(c.x + i * 22, jy + 8, 3, 6, INK);
  } else {
    R(c.x + 70 - reach, jy, reach, 8, c.color);
    R(c.x + 10, jy + 8, 60, 4, INK);
    for (let i = 0; i * 22 < reach - 70; i++) R(c.x - i * 22, jy + 8, 3, 6, INK);
  }
  R(c.x - 12, jy - 26, 24, 26, '#444');
  R(c.x - 8, jy - 20, 16, 10, '#9fe7ff');
  R(c.x - 50, jy - 46, 100, 16, INK);
  text(c.label, c.x, jy - 42, 6, c.color, 'center');
}

const MARK_COLOR = { red: UNTESTED, amber: '#ffb429', green: '#5ad45a' } as const;

function drawBrick(ctx: Ctx, n: BrickBox, x: number, y: number, R: Rect, mark?: BrickMark) {
  R(x, y, n.w, n.h, n.color || layerColor(n.layer));
  R(x, y, n.w, 2, 'rgba(255,255,255,.45)');
  R(x, y + n.h - 2, n.w, 2, 'rgba(0,0,0,.45)');
  R(x + n.w - 2, y, 2, n.h, 'rgba(0,0,0,.35)');
  for (let i = 10; i < n.w - 4; i += 14)
    R(x + i, y + (((i / 14) | 0) % 2 ? 2 : 7), 2, 5, 'rgba(0,0,0,.25)');
  if (mark) R(x + 2, y + 2, 3, 3, MARK_COLOR[mark]);
  if (n.binary) R(x + n.w - 6, y + 2, 3, 3, '#fff');
  void ctx;
}

function drawJcb(f: Frame, s: Scene, R: Rect) {
  const sc = 3;
  const x0 = f.jcb.x;
  const y0 = s.ground - 11 * sc;
  JCB.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]!;
      if (ch !== '.' && ch !== ' ') R(x0 + i * sc, y0 + j * sc, sc, sc, JCB_PAL[ch]!);
    }
  });
  const bx = x0 + 21 * sc;
  const by = s.ground - 9 * sc;
  const up = f.jcb.busy ? f.jcb.arm * 40 : 0;
  R(bx - 6, by, 26, 4, '#ffb429');
  R(bx + 18, by - up, 4, up + 4, '#ffb429');
  R(bx + 10, by - up - 10, 22, 12, '#444');
  R(bx + 12, by - up - 14, 18, 4, '#777');
}

function cable(ctx: Ctx, a: BrickBox, b: BrickBox, color: string, R: Rect) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h;
  const bx = b.x + b.w / 2;
  const by = b.y;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, ay + 5);
  ctx.lineTo(bx, by - 5);
  ctx.lineTo(bx, by);
  ctx.stroke();
  R(bx - 3, by - 3, 6, 6, color);
}
