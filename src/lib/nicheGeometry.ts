import { Room, RoomNicheCross, RoomNicheElement, RoomNicheWall, WallPoint } from '../types';
import { Point, dist, pxToCm, pointInPolygon, pathTurns } from './geometry';

// Niches set against the walls (RoomNicheWall) are stored as cm along a chain
// of walls; everything drawn or billed is derived from that here.

const cmToPx = (cm: number) => cm / pxToCm(1);

/** Unit normal of wall i pointing into the room */
export function inwardNormal(pts: Point[], i: number): Point {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const probe = { x: mid.x + nx * 2, y: mid.y + ny * 2 };
  return pointInPolygon(probe, pts) ? { x: nx, y: ny } : { x: -nx, y: -ny };
}

/** Walls a niche can follow — straight ones (a niche on an arc is drawn by points) */
export const isStraightWall = (pts: Point[], i: number) => !pts[i]?.bulge;

export const wallLengthCm = (pts: Point[], i: number) => pxToCm(dist(pts[i], pts[(i + 1) % pts.length]));

/** Total length of a chain of walls, in cm */
export const chainLengthCm = (pts: Point[], edges: number[]) => edges.reduce((s, e) => s + wallLengthCm(pts, e), 0);

/** Point `cm` along a chain of walls, with the wall it falls on */
export function pointAlongChain(pts: Point[], edges: number[], cm: number): { point: Point; edge: number } {
  let rest = cm;
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k];
    const len = wallLengthCm(pts, e);
    if (rest <= len || k === edges.length - 1) {
      const a = pts[e], b = pts[(e + 1) % pts.length];
      const t = len ? Math.max(0, Math.min(1, rest / len)) : 0;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, edge: e };
    }
    rest -= len;
  }
  return { point: pts[edges[0]], edge: edges[0] };
}

/** Distance along a chain of walls (cm) of the chain point nearest to `p` */
export function chainCmAt(pts: Point[], edges: number[], p: Point): number {
  let best = { d: Infinity, cm: 0 }, before = 0;
  for (const e of edges) {
    const a = pts[e], b = pts[(e + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = dist(p, q);
    const len = wallLengthCm(pts, e);
    if (d < best.d) best = { d, cm: before + len * t };
    before += len;
  }
  return best.cm;
}

/** Where a niche's two ends sit along its chain: cm from the chain's first corner to its start and end */
export function nicheSpan(room: Room, n: RoomNicheWall): { from: number; to: number; total: number } {
  const total = chainLengthCm(room.points, n.edges);
  const from = Math.max(0, Math.min(total, n.startCm));
  const to = Math.max(from, Math.min(total, total - Math.max(0, n.endCm)));
  return { from, to, total };
}

function intersect(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / det;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

export interface NicheShape {
  /** along the wall, from the niche start to its end, through the corners between */
  wall: Point[];
  /** the canvas edge, `depth` into the room */
  inner: Point[];
  /** halfway between — where the curtain track or the cornice runs */
  rail: Point[];
  lengthM: number;
  /** corners the niche turns, each a corner of its profile */
  turns: number;
  freeStart: boolean;
  freeEnd: boolean;
}

/**
 * Lines offset `d` px into the room from each wall piece of `wall`. Where the
 * niche starts right in a room corner, its offset line runs on until it meets
 * the wall before, so the band fills that corner instead of leaving a notch.
 */
function offsetLine(pts: Point[], wall: Point[], walls: number[], d: number, startInCorner: boolean, endInCorner: boolean): Point[] {
  const n = pts.length;
  const dirOf = (e: number) => {
    const a = pts[e], b = pts[(e + 1) % n];
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const shift = (p: Point, e: number) => { const nr = inwardNormal(pts, e); return { x: p.x + nr.x * d, y: p.y + nr.y * d }; };
  const out: Point[] = [];
  const first = walls[0], last = walls[walls.length - 1];
  const prev = (first - 1 + n) % n, next = (last + 1) % n;
  out.push(startInCorner
    ? intersect(shift(wall[0], first), dirOf(first), pts[prev], dirOf(prev)) ?? shift(wall[0], first)
    : shift(wall[0], first));
  for (let k = 1; k < wall.length - 1; k++) {
    const e0 = walls[k - 1], e1 = walls[k];
    out.push(intersect(shift(wall[k], e0), dirOf(e0), shift(wall[k], e1), dirOf(e1)) ?? shift(wall[k], e1));
  }
  const endPt = wall[wall.length - 1];
  out.push(endInCorner
    ? intersect(shift(endPt, last), dirOf(last), pts[next], dirOf(next)) ?? shift(endPt, last)
    : shift(endPt, last));
  return out;
}

/** Everything drawn for a wall niche; null when it no longer fits the room */
export function nicheShape(room: Room, n: RoomNicheWall): NicheShape | null {
  const pts = room.points;
  if (pts.length < 3 || n.edges.length === 0 || n.edges.some(e => e >= pts.length || !isStraightWall(pts, e))) return null;
  const { from, to, total } = nicheSpan(room, n);
  if (to - from < 1) return null;
  // Wall points from the start to the end, with each wall's piece remembered
  const wall: Point[] = [pointAlongChain(pts, n.edges, from).point];
  const walls: number[] = [];
  let before = 0;
  for (const e of n.edges) {
    const len = wallLengthCm(pts, e);
    const lo = Math.max(from, before), hi = Math.min(to, before + len);
    if (hi > lo + 1e-6) {
      walls.push(e);
      if (hi < to - 1e-6) wall.push(pts[(e + 1) % pts.length]);
    }
    before += len;
  }
  wall.push(pointAlongChain(pts, n.edges, to).point);
  if (walls.length === 0) return null;
  const freeStart = from > 0.5, freeEnd = to < total - 0.5;
  const d = cmToPx(n.depthCm);
  const inner = offsetLine(pts, wall, walls, d, !freeStart, !freeEnd);
  const rail = offsetLine(pts, wall, walls, d / 2, !freeStart, !freeEnd);
  return {
    wall, inner, rail,
    lengthM: (to - from) / 100,
    turns: pathTurns(wall),
    freeStart, freeEnd,
  };
}

/**
 * The niche's own cut into the canvas outline — from where it leaves the wall
 * to where it meets it again — so fabric corners count the notch it makes.
 */
export function nicheOutlinePath(s: NicheShape): Point[] {
  return [
    ...(s.freeStart ? [s.wall[0]] : []),
    ...s.inner,
    ...(s.freeEnd ? [s.wall[s.wall.length - 1]] : []),
  ];
}

// ── Across the room ──

/** Canvas point of a wall point (its cm held within the wall) */
export function wallPointXY(pts: Point[], wp: WallPoint): Point {
  const a = pts[wp.edge], b = pts[(wp.edge + 1) % pts.length];
  const len = wallLengthCm(pts, wp.edge);
  const t = len ? Math.max(0, Math.min(1, wp.cm / len)) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The two ends of a niche across the room; null when a wall it ends on is gone or curved */
export function crossLine(room: Room, n: RoomNicheCross): [Point, Point] | null {
  const pts = room.points;
  if (pts.length < 3 || [n.a, n.b].some(w => w.edge >= pts.length || !isStraightWall(pts, w.edge)) || n.a.edge === n.b.edge) return null;
  return [wallPointXY(pts, n.a), wallPointXY(pts, n.b)];
}

/** Width of a niche across the room — set, or the usual curtain profile */
export const DEFAULT_CROSS_WIDTH = 10;
export const crossWidthCm = (n: RoomNicheCross) => n.widthCm ?? DEFAULT_CROSS_WIDTH;

/**
 * A niche across the room as a band `widthCm` wide around its line: the two
 * canvas edges run parallel to it, each cut off where it meets the walls.
 */
export function crossBand(room: Room, n: RoomNicheCross): { line: [Point, Point]; edges: [Point[], Point[]]; band: Point[] } | null {
  const line = crossLine(room, n);
  if (!line) return null;
  const pts = room.points;
  const [A, B] = line;
  const len = dist(A, B) || 1;
  const d = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
  const half = cmToPx(crossWidthCm(n)) / 2;
  const wallDir = (e: number) => { const a = pts[e], b = pts[(e + 1) % pts.length]; return { x: b.x - a.x, y: b.y - a.y }; };
  const side = (sign: 1 | -1): Point[] => {
    const o = { x: -d.y * half * sign, y: d.x * half * sign };
    const from = { x: A.x + o.x, y: A.y + o.y };
    const ea = intersect(from, d, pts[n.a.edge], wallDir(n.a.edge)) ?? from;
    const eb = intersect(from, d, pts[n.b.edge], wallDir(n.b.edge)) ?? { x: B.x + o.x, y: B.y + o.y };
    return [ea, eb];
  };
  const left = side(1), right = side(-1);
  return { line, edges: [left, right], band: [left[0], left[1], right[1], right[0]] };
}

/**
 * Corners a niche across the room adds to the canvas: an end in the middle of
 * a wall makes a corner on each side of it (2); one right in a room corner
 * splits that corner in two (1).
 */
export function crossCorners(room: Room, n: RoomNicheCross): number {
  if (!crossLine(room, n)) return 0;
  const end = (w: WallPoint) => {
    const len = wallLengthCm(room.points, w.edge);
    return w.cm < 0.5 || w.cm > len - 0.5 ? 1 : 2;
  };
  return end(n.a) + end(n.b);
}

/**
 * Where a wall point lands, in cm along its wall: the line exactly square to
 * the far end (`square`) or a corner when within `tolCm`, else the nearest 5 cm.
 */
export function snapWallCm(lenCm: number, cm: number, tolCm: number, square?: number | null): { cm: number; square: boolean } {
  if (square != null && square >= 0 && square <= lenCm && Math.abs(cm - square) <= tolCm) return { cm: square, square: true };
  for (const c of [0, lenCm]) if (Math.abs(cm - c) <= tolCm) return { cm: c, square: false };
  return { cm: Math.max(0, Math.min(lenCm, Math.round(cm / 5) * 5)), square: false };
}

/** cm along wall `edge` where a line from `from` square to that wall (or to `from`'s own wall) meets it; null if it misses */
export function squareCmOn(pts: Point[], edge: number, from: WallPoint): number | null {
  const p = wallPointXY(pts, from);
  const nr = inwardNormal(pts, from.edge);
  const a = pts[edge], b = pts[(edge + 1) % pts.length];
  const hit = intersect(p, nr, a, { x: b.x - a.x, y: b.y - a.y });
  if (!hit) return null;
  const len = dist(a, b);
  const t = ((hit.x - a.x) * (b.x - a.x) + (hit.y - a.y) * (b.y - a.y)) / (len * len);
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return Math.max(0, Math.min(1, t)) * wallLengthCm(pts, edge);
}

/** Length, turns and end caps of any drawn niche; null for one counted in pieces or one that no longer fits */
export function nicheMetrics(room: Room, n: RoomNicheElement): { lengthM: number; turns: number; caps: number } | null {
  if (n.kind === 'count') return null;
  if (n.kind === 'path') return { lengthM: n.lengthM, turns: pathTurns(n.points), caps: n.caps ?? 0 };
  if (n.kind === 'cross') {
    const line = crossLine(room, n);
    return line ? { lengthM: pxToCm(dist(line[0], line[1])) / 100, turns: 0, caps: 0 } : null;
  }
  const s = nicheShape(room, n);
  return s ? { lengthM: s.lengthM, turns: s.turns, caps: +s.freeStart + +s.freeEnd } : null;
}

/** Outline paths of all drawn niches, for the fabric corner count */
export function nicheCutPaths(room: Room): Point[][] {
  const out: Point[][] = [];
  for (const n of room.selectedNiches ?? []) {
    if (n.kind === 'path') out.push(n.points);
    else if (n.kind === 'wall') { const s = nicheShape(room, n); if (s) out.push(nicheOutlinePath(s)); }
  }
  return out;
}

