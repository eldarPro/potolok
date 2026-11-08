import { Room, Shrink } from '../types';
import {
  Point, cornerIndices, edgeLen, pxToCm, tessellateRoom, pointLabel, pointOnArc, pointInPolygon, polygonArea, sampleArc,
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

const clampAll = (s: Shrink): Shrink => ({
  pct: clampShrink(s.pct),
  ...(s.axes ? { axes: { x: clampShrink(s.axes.x), y: clampShrink(s.axes.y) } } : {}),
  ...(s.axes && s.one ? { one: true } : {}),
});

/** The order's shrink used last time, so the master doesn't retype it per order */
export function loadShrink(): Shrink {
  try {
    const raw = localStorage.getItem(SHRINK_KEY);
    if (raw === null) return { pct: DEFAULT_SHRINK };
    const v = JSON.parse(raw);
    // saved before shrink along the sides existed: a bare number
    if (typeof v === 'number' && Number.isFinite(v)) return { pct: clampShrink(v) };
    if (v && Number.isFinite(v.pct)) return clampAll(v);
  } catch { /* unreadable — the default */ }
  return { pct: DEFAULT_SHRINK };
}

export function saveShrink(s: Shrink): void {
  try { localStorage.setItem(SHRINK_KEY, JSON.stringify(clampAll(s))); } catch { /* private mode */ }
}

/** Percent along the drawing's length (x) and width (y) */
/** Shrinks differently along the length and the width */
export const byAxes = (s: Shrink) => !!s.axes && !s.one;

export const shrinkXY = (s: Shrink) => (byAxes(s) ? s.axes! : { x: s.pct, y: s.pct });

/** The shrink a room goes to the workshop with: its own, else the order's */
export const roomShrink = (room: Room, order: Shrink) => room.shrink ?? order;

export const sameShrink = (a: Shrink, b: Shrink) => {
  const p = shrinkXY(a), q = shrinkXY(b);
  return p.x === q.x && p.y === q.y;
};

/** A length in cm with the shrink taken off, rounded to the cm the workshop cuts by */
export const shrinkCm = (cm: number, pct: number) => Math.round(cm * (1 - pct / 100));

/** Shown with a comma, as the masters write it: 7 → "7", 7.5 → "7,5" */
export const fmtPct = (pct: number) => String(pct).replace('.', ',');

export interface ShrunkWall {
  /** corner letters, e.g. "AB" */
  name: string;
  /** cut length, shrink taken off */
  cm: number;
  /** as measured */
  realCm: number;
  arc: boolean;
  /** corner to corner, straight, in canvas px */
  chord: number;
  /** where the size goes: the wall's middle, the direction along it, and outward */
  mid: Point;
  dir: Point;
  out: Point;
}

export interface ShrunkDiagonal {
  name: string;
  cm: number;
  realCm: number;
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
  realAreaSqm: number;
  realPerimeterM: number;
  /** percent along the length (x) and width (y) */
  pct: { x: number; y: number };
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
export function shrinkRoom(room: Room, shrink: Shrink): ShrunkRoom | null {
  const pts = room.points;
  if (pts.length < 3) return null;
  const pct = shrinkXY(shrink);
  const kx = 1 - pct.x / 100, ky = 1 - pct.y / 100;
  // A length once the sheet has shrunk along x and y. Shrunk evenly an arc
  // stays an arc; unevenly it turns into a flattened curve, so measure that
  // along its points.
  const cutLen = (a: Point, b: Point, bulge?: number) => {
    if (kx === ky) return edgeLen(a, b, bulge) * kx;
    const ps = bulge ? sampleArc(a, b, bulge, 48) : [a, b];
    let l = 0;
    for (let i = 1; i < ps.length; i++) l += Math.hypot((ps[i].x - ps[i - 1].x) * kx, (ps[i].y - ps[i - 1].y) * ky);
    return l;
  };
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
    let px = 0, cutPx = 0, arc = false;
    for (let i = from; ; i = (i + 1) % n) {
      const j = (i + 1) % n;
      px += edgeLen(pts[i], pts[j], pts[i].bulge);
      cutPx += cutLen(pts[i], pts[j], pts[i].bulge);
      if (pts[i].bulge) arc = true;
      if (j === to) break;
    }
    const A = pts[from], B = pts[to];
    // a wall that is one arc: the size sits at the top of the arc
    const mid = arc && (from + 1) % n === to
      ? pointOnArc(A, B, A.bulge, 0.5)
      : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const dir = unit(B.x - A.x, B.y - A.y);
    return { name: labels[from] + labels[to], cm: Math.round(pxToCm(cutPx)), realCm: Math.round(pxToCm(px)), chord: Math.hypot(B.x - A.x, B.y - A.y), arc, mid, dir, out: outward(mid, dir) };
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
      cm: Math.round(pxToCm(cutLen(pts[d.i], pts[d.j]))),
      realCm: Math.round(pxToCm(Math.hypot(pts[d.j].x - pts[d.i].x, pts[d.j].y - pts[d.i].y))),
      a: pts[d.i],
      b: pts[d.j],
    }));

  const realAreaSqm = (pxToCm(1) / 100) ** 2 * polygonArea(pts);
  return {
    outline, corners: cornerOut, walls, diagonals, pct,
    areaSqm: realAreaSqm * kx * ky,
    perimeterM: walls.reduce((s, w) => s + w.cm, 0) / 100,
    realAreaSqm,
    realPerimeterM: walls.reduce((s, w) => s + w.realCm, 0) / 100,
  };
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

/** Short form for a chip: "7 %" or "↔7 · ↕8 %" */
export const fmtShrink = (s: Shrink) => {
  const { x, y } = shrinkXY(s);
  return x === y ? `${fmtPct(x)} %` : `↔${fmtPct(x)} · ↕${fmtPct(y)} %`;
};

/** A label's box: centre and size, in the units of the drawing it sits on */
export interface LabelBox { x: number; y: number; w: number; h: number }

const overlaps = (a: LabelBox, b: LabelBox) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

const rotate = (v: Point, deg: number): Point => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

/**
 * Where the wall sizes and corner letters go on a small drawing so none sits
 * on another or on a wall line. Short walls meeting at an inner corner put
 * all three at nearly the same spot otherwise. Each wall size starts just
 * outside its wall's middle and, if that's taken, moves further out or slides
 * along the wall — longest walls first, they keep the plain spot. Then each
 * corner letter turns around its corner until it finds room. Screen units.
 */
export function placeLabels(
  walls: { mid: Point; dir: Point; out: Point; len: number; tw: number; th: number }[],
  corners: { p: Point; out: Point; size: number }[],
  outline: Point[],
  bounds: { w: number; h: number },
  gap: number,
): { walls: Point[]; corners: Point[] } {
  // the wall lines, as points every few units
  const line: Point[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let k = 0; k < steps; k++) line.push({ x: a.x + (b.x - a.x) * k / steps, y: a.y + (b.y - a.y) * k / steps });
  });
  const taken: LabelBox[] = [];
  const free = (box: LabelBox) =>
    box.x - box.w / 2 >= 0 && box.x + box.w / 2 <= bounds.w && box.y - box.h / 2 >= 0 && box.y + box.h / 2 <= bounds.h
    && taken.every(t => !overlaps(t, box))
    && line.every(p => Math.abs(p.x - box.x) * 2 >= box.w - 1 || Math.abs(p.y - box.y) * 2 >= box.h - 1);
  const pick = (cands: LabelBox[]) => {
    const box = cands.find(free) ?? cands[0];
    taken.push(box);
    return { x: box.x, y: box.y };
  };

  const wallSpots: Point[] = new Array(walls.length);
  walls
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.len - a.w.len)
    .forEach(({ w, i }) => {
      // the text's box once turned along the wall
      const c = Math.abs(w.dir.x), s = Math.abs(w.dir.y);
      const bw = c * w.tw + s * w.th, bh = s * w.tw + c * w.th;
      const cands: LabelBox[] = [];
      for (const d of [1, 1.7, 2.4])
        for (const slide of [0, 0.25, -0.25, 0.4, -0.4]) {
          const x = w.mid.x + w.out.x * gap * d + w.dir.x * w.len * slide;
          const y = w.mid.y + w.out.y * gap * d + w.dir.y * w.len * slide;
          cands.push({ x, y, w: bw, h: bh });
        }
      wallSpots[i] = pick(cands);
    });

  const cornerSpots = corners.map(cn => {
    const cands: LabelBox[] = [];
    for (const r of [0.9, 1.4])
      for (const a of [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]) {
        const v = rotate(cn.out, a);
        cands.push({ x: cn.p.x + v.x * gap * r, y: cn.p.y + v.y * gap * r, w: cn.size, h: cn.size });
      }
    return pick(cands);
  });
  return { walls: wallSpots, corners: cornerSpots };
}
