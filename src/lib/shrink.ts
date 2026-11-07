import { Room } from '../types';
import {
  Point, cornerIndices, edgeLen, pxToCm, tessellateRoom, pointLabel, pointOnArc, pointInPolygon, polygonArea,
} from './geometry';
import { roomDiagonals } from './diagonals';

// The workshop cuts PVC film smaller than the room: heated on the job it
// stretches onto the profile and pulls tight as it cools. The workshop gets
// the cut sizes — every length taken down by the shrink percentage.

export const DEFAULT_SHRINK = 7;
export const SHRINK_MIN = 0;
export const SHRINK_MAX = 20;
export const SHRINK_PRESETS = [5, 6, 7, 8, 10];

const SHRINK_KEY = 'ceiling_shrink_pct';

export const clampShrink = (pct: number) => Math.min(SHRINK_MAX, Math.max(SHRINK_MIN, Math.round(pct * 10) / 10));

/** The percentage used last time, so the master doesn't retype it per order */
export function loadShrink(): number {
  try {
    const v = Number(localStorage.getItem(SHRINK_KEY));
    return localStorage.getItem(SHRINK_KEY) !== null && Number.isFinite(v) ? clampShrink(v) : DEFAULT_SHRINK;
  } catch { return DEFAULT_SHRINK; }
}

export function saveShrink(pct: number): void {
  try { localStorage.setItem(SHRINK_KEY, String(clampShrink(pct))); } catch { /* private mode */ }
}

/** A length in cm with the shrink taken off, rounded to the cm the workshop cuts by */
export const shrinkCm = (cm: number, pct: number) => Math.round(cm * (1 - pct / 100));

/** Shown with a comma, as the masters write it: 7 → "7", 7.5 → "7,5" */
export const fmtPct = (pct: number) => String(pct).replace('.', ',');

export interface ShrunkWall {
  /** corner letters, e.g. "AB" */
  name: string;
  cm: number;
  arc: boolean;
  /** where the size goes: the wall's middle, the direction along it, and outward */
  mid: Point;
  dir: Point;
  out: Point;
}

export interface ShrunkDiagonal {
  name: string;
  cm: number;
  a: Point;
  b: Point;
}

/** A room as the workshop gets it: cut sizes, in the room's own (canvas px) coordinates */
export interface ShrunkRoom {
  outline: Point[];
  corners: { p: Point; label: string; out: Point }[];
  walls: ShrunkWall[];
  diagonals: ShrunkDiagonal[];
  areaSqm: number;
  perimeterM: number;
}

const unit = (x: number, y: number): Point => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/**
 * Walls run corner to corner: a point splitting a straight wall (for a
 * different profile) means nothing to the cutter, so the wall's parts are
 * summed into one length. Diagonals are the ones shown on the drawing.
 */
export function shrinkRoom(room: Room, pct: number): ShrunkRoom | null {
  const pts = room.points;
  if (pts.length < 3) return null;
  const n = pts.length;
  const outline = tessellateRoom(pts, true);
  const corners = cornerIndices(pts);
  // The workshop gets the corners lettered in a row — A, B, C… — even where the
  // drawing skips a letter for a point that only splits a wall
  const labels: string[] = [];
  corners.forEach((i, k) => { labels[i] = pointLabel(k).toUpperCase(); });

  const outward = (mid: Point, dir: Point): Point => {
    const nrm = { x: dir.y, y: -dir.x };
    const probe = { x: mid.x + nrm.x * 4, y: mid.y + nrm.y * 4 };
    return pointInPolygon(probe, outline) ? { x: -nrm.x, y: -nrm.y } : nrm;
  };

  const walls: ShrunkWall[] = corners.map((from, k) => {
    const to = corners[(k + 1) % corners.length];
    let px = 0, arc = false;
    for (let i = from; ; i = (i + 1) % n) {
      const j = (i + 1) % n;
      px += edgeLen(pts[i], pts[j], pts[i].bulge);
      if (pts[i].bulge) arc = true;
      if (j === to) break;
    }
    const A = pts[from], B = pts[to];
    // a wall that is one arc: the size sits at the top of the arc
    const mid = arc && (from + 1) % n === to
      ? pointOnArc(A, B, A.bulge, 0.5)
      : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const dir = unit(B.x - A.x, B.y - A.y);
    return { name: labels[from] + labels[to], cm: shrinkCm(pxToCm(px), pct), arc, mid, dir, out: outward(mid, dir) };
  });

  const cornerOut = corners.map(i => {
    const prev = pts[corners[(corners.indexOf(i) - 1 + corners.length) % corners.length]];
    const next = pts[corners[(corners.indexOf(i) + 1) % corners.length]];
    const p = pts[i];
    const a = unit(p.x - prev.x, p.y - prev.y), b = unit(next.x - p.x, next.y - p.y);
    let v = unit(a.x - b.x, a.y - b.y);
    // the bisector of a reflex corner points into the room — flip it out
    if (pointInPolygon({ x: p.x + v.x * 4, y: p.y + v.y * 4 }, outline)) v = { x: -v.x, y: -v.y };
    return { p, label: labels[i], out: v };
  });

  const hidden = new Set(room.hiddenDiagonals ?? []);
  const diagonals = roomDiagonals(pts)
    .filter(d => !hidden.has(d.key))
    .map(d => ({
      name: labels[d.i] + labels[d.j],
      cm: shrinkCm(pxToCm(Math.hypot(pts[d.j].x - pts[d.i].x, pts[d.j].y - pts[d.i].y)), pct),
      a: pts[d.i],
      b: pts[d.j],
    }));

  const k = 1 - pct / 100;
  const areaSqm = (pxToCm(1) / 100) ** 2 * polygonArea(pts) * k * k;
  const perimeterM = walls.reduce((s, w) => s + w.cm, 0) / 100;
  return { outline, corners: cornerOut, walls, diagonals, areaSqm, perimeterM };
}

/** Fits a room's coordinates into a w×h box with `pad` around it */
export function fitBox(outline: Point[], w: number, h: number, pad: number) {
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = Math.max(...xs) - minX || 1, bh = Math.max(...ys) - minY || 1;
  const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * s) / 2, oy = (h - bh * s) / 2;
  return (p: Point): Point => ({ x: (p.x - minX) * s + ox, y: (p.y - minY) * s + oy });
}

/** Text angle along a direction, kept upright (degrees, clockwise on screen) */
export const uprightDeg = (dir: Point) => {
  let deg = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
};

/**
 * Where each diagonal's size goes, as a fraction along it: the middle unless
 * that lands on another label (two diagonals of a rectangle cross there).
 */
export function diagonalLabelSpots(segs: { a: Point; b: Point }[], minDx: number, minDy: number): Point[] {
  const placed: Point[] = [];
  for (const { a, b } of segs) {
    const at = (u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const u = [0.5, 0.38, 0.62, 0.3, 0.7, 0.24, 0.76]
      .find(t => placed.every(q => Math.abs(q.x - at(t).x) > minDx || Math.abs(q.y - at(t).y) > minDy)) ?? 0.5;
    placed.push(at(u));
  }
  return placed;
}

/** Rooms that can go to the workshop: a closed outline */
export const isDrawn = (room: Room) => room.points.length >= 3 && room.areaSqm > 0;
